// Production backend: Supabase Postgres over PostgREST.
//
// PostgREST is plain HTTPS, so there is no connection pool to keep warm — which
// is what makes it a good fit for Vercel's per-request containers. The service
// role key is used server-side only; the tables have RLS on with no policies,
// so no browser-side key can reach them.
//
// This uses @supabase/postgrest-js (the database half of supabase-js) rather
// than the full client: the app never touches Realtime, Auth or Storage, and
// the full client eagerly constructs a Realtime socket that needs a WebSocket
// polyfill on Node 20. Same query syntax, smaller serverless bundle.

import { PostgrestClient } from '@supabase/postgrest-js'
import { config } from '../config.js'
import { newSlug, normaliseEmail } from './shared.js'

/** Supabase could not be contacted at all (DNS, TCP, timeout). */
export class SupabaseUnreachable extends Error {}

/**
 * Supabase answered but refused the request: wrong key, or the preview_ tables
 * are missing. That is a configuration problem rather than an outage, so it is
 * reported separately — but it is still fallback-eligible on a machine with a
 * disk, so local development keeps working while it is being sorted out.
 */
export class SupabaseUnusable extends Error {}

// Every object this app owns is prefixed so the project can be shared with
// other applications. These names must match supabase/schema.sql.
const TABLE = {
  users: 'preview_users',
  shares: 'preview_shares',
  invites: 'preview_share_invites',
}
const FN_INCREMENT_VIEWS = 'preview_increment_share_views'

let client = null

function db() {
  if (client) return client
  client = new PostgrestClient(`${config.supabase.url}/rest/v1`, {
    headers: {
      apikey: config.supabase.serviceKey,
      Authorization: `Bearer ${config.supabase.serviceKey}`,
    },
    // A hung database should fail the request, not hold a serverless
    // invocation open until the platform kills it.
    fetch: (url, options = {}) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(config.supabase.timeoutMs) }),
  })
  return client
}

function rethrow(error, context) {
  const message = String(error?.message || error)
  const code = error?.code || ''

  const networkish =
    error?.name === 'TypeError' ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)
  if (networkish) throw new SupabaseUnreachable(`${context}: ${message}`)

  // PGRST205: table missing from the schema cache — the migration has not been
  // run. 42P01: relation does not exist. 42501 / JWT / API-key messages: the
  // key cannot see these tables.
  const misconfigured =
    code === 'PGRST205' ||
    code === 'PGRST106' ||
    code === '42P01' ||
    code === '42501' ||
    /invalid api key|jwt|no api key|permission denied|schema cache/i.test(message)
  if (misconfigured) throw new SupabaseUnusable(`${context}: ${message}`)

  throw new Error(`${context}: ${message}`)
}

async function run(context, thenable) {
  let result
  try {
    result = await thenable
  } catch (err) {
    rethrow(err, context)
  }
  if (result.error) rethrow(result.error, context)
  return result.data
}

const shape = (row) =>
  row && {
    slug: row.slug,
    ownerId: row.owner_id,
    title: row.title,
    visibility: row.visibility,
    workspace: row.workspace,
    previewHtml: row.preview_html,
    views: row.views,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    invites: (row[TABLE.invites] || []).map((i) => i.email).sort(),
  }

// PostgREST embeds the invite rows through the foreign key.
const SHARE_COLUMNS = `*, ${TABLE.invites} (email)`

export const supabaseStore = {
  mode: 'supabase',

  async ping() {
    await run('supabase ping', db().from(TABLE.shares).select('slug').limit(1))
    return true
  },

  users: {
    async upsert({ provider, providerId, email, name, avatar }) {
      const rows = await run(
        'load user',
        db().from(TABLE.users).select('*').eq('provider', provider).eq('provider_id', String(providerId)).limit(1)
      )
      const existing = rows[0]
      if (existing) {
        const updated = await run(
          'update user',
          db()
            .from(TABLE.users)
            .update({ email: email ?? existing.email, name: name ?? existing.name, avatar: avatar ?? existing.avatar })
            .eq('id', existing.id)
            .select()
            .single()
        )
        return updated
      }
      return run(
        'create user',
        db()
          .from(TABLE.users)
          .insert({ provider, provider_id: String(providerId), email: email || null, name: name || null, avatar: avatar || null })
          .select()
          .single()
      )
    },

    async byId(id) {
      const rows = await run('load user by id', db().from(TABLE.users).select('*').eq('id', id).limit(1))
      return rows[0] || null
    },
  },

  shares: {
    async create({ ownerId, title, workspace, previewHtml, visibility, invites }) {
      const slug = newSlug()
      await run(
        'create share',
        db().from(TABLE.shares).insert({
          slug,
          owner_id: ownerId,
          title,
          visibility,
          workspace,
          preview_html: previewHtml || null,
        })
      )
      await supabaseStore.shares.setInvites(slug, invites)
      return supabaseStore.shares.bySlug(slug)
    },

    async update(slug, { title, workspace, previewHtml, visibility, invites }) {
      const current = await supabaseStore.shares.bySlug(slug)
      if (!current) return null
      await run(
        'update share',
        db()
          .from(TABLE.shares)
          .update({
            title: title ?? current.title,
            visibility: visibility ?? current.visibility,
            workspace: workspace ?? current.workspace,
            preview_html: previewHtml === undefined ? current.previewHtml : previewHtml,
            updated_at: new Date().toISOString(),
          })
          .eq('slug', slug)
      )
      if (invites) await supabaseStore.shares.setInvites(slug, invites)
      return supabaseStore.shares.bySlug(slug)
    },

    async setInvites(slug, invites = []) {
      const clean = [...new Set((invites || []).map(normaliseEmail).filter(Boolean))]
      await run('clear invites', db().from(TABLE.invites).delete().eq('slug', slug))
      if (clean.length) {
        await run('add invites', db().from(TABLE.invites).insert(clean.map((email) => ({ slug, email }))))
      }
      return clean
    },

    async bySlug(slug) {
      const rows = await run('load share', db().from(TABLE.shares).select(SHARE_COLUMNS).eq('slug', slug).limit(1))
      return shape(rows[0]) || null
    },

    async listByOwner(ownerId) {
      const rows = await run(
        'list shares',
        db().from(TABLE.shares).select(SHARE_COLUMNS).eq('owner_id', ownerId).order('updated_at', { ascending: false })
      )
      return rows.map(shape)
    },

    async remove(slug) {
      await run('delete invites', db().from(TABLE.invites).delete().eq('slug', slug))
      await run('delete share', db().from(TABLE.shares).delete().eq('slug', slug))
      return true
    },

    async countView(slug) {
      // Defined in supabase/schema.sql so the counter cannot lose concurrent bumps.
      await run('count view', db().rpc(FN_INCREMENT_VIEWS, { p_slug: slug }))
    },
  },
}
