// Picks a storage backend and, where a disk exists, keeps working if Supabase
// goes away. Everything above this file talks to one interface.

import { config } from '../config.js'
import { sqliteStore } from './sqlite.js'
import { SupabaseUnreachable, SupabaseUnusable, supabaseStore } from './supabase.js'
import { access } from './shared.js'

const state = {
  mode: config.supabase.enabled ? 'supabase' : 'sqlite',
  degraded: false,
  reason: null,
  lastError: null,
  fallbackUntil: 0,
}

const FALLBACK_WINDOW_MS = 30_000

function primary() {
  if (!config.supabase.enabled) return sqliteStore
  if (state.degraded && Date.now() < state.fallbackUntil) return sqliteStore
  return supabaseStore
}

/**
 * Runs an operation against the chosen backend. If Supabase is unreachable and
 * this machine has a disk, the same call is retried against SQLite and the
 * server is marked degraded — the data is local-only until Supabase returns, so
 * that state is reported through /api/me rather than hidden.
 */
async function withStore(pick) {
  const backend = primary()
  try {
    const result = await pick(backend)
    if (backend === supabaseStore && state.degraded) {
      state.degraded = false
      state.reason = null
      state.lastError = null
      console.log('storage      supabase working again')
    }
    return result
  } catch (err) {
    const unreachable = err instanceof SupabaseUnreachable
    const unusable = err instanceof SupabaseUnusable
    if (!unreachable && !unusable) throw err

    state.lastError = err.message
    state.reason = unreachable ? 'unreachable' : 'rejected'

    if (!config.allowLocalFallback) {
      throw new Error(
        unreachable
          ? `The share database is unreachable (${err.message}). Shares cannot be read or written until Supabase responds.`
          : `The share database rejected the request (${err.message}). Check SUPABASE_SERVICE_ROLE_KEY, and that the migration in supabase/migrations has been applied (npm run db:push).`
      )
    }

    if (!state.degraded) {
      console.warn(
        unreachable
          ? `storage      supabase unreachable, using local file: ${err.message}`
          : `storage      supabase rejected the request, using local file: ${err.message}`
      )
    }
    state.degraded = true
    state.fallbackUntil = Date.now() + FALLBACK_WINDOW_MS
    return pick(sqliteStore)
  }
}

export const users = {
  upsert: (profile) => withStore((store) => store.users.upsert(profile)),
  byId: (id) => withStore((store) => store.users.byId(id)),
}

export const shares = {
  create: (payload) => withStore((store) => store.shares.create(payload)),
  update: (slug, payload) => withStore((store) => store.shares.update(slug, payload)),
  setInvites: (slug, invites) => withStore((store) => store.shares.setInvites(slug, invites)),
  bySlug: (slug) => withStore((store) => store.shares.bySlug(slug)),
  listByOwner: (ownerId) => withStore((store) => store.shares.listByOwner(ownerId)),
  remove: (slug) => withStore((store) => store.shares.remove(slug)),
  countView: (slug) => withStore((store) => store.shares.countView(slug)),
  access,
}

export function describeStore() {
  return {
    mode: config.supabase.enabled ? 'supabase' : 'sqlite',
    active: state.degraded ? 'sqlite' : config.supabase.enabled ? 'supabase' : 'sqlite',
    degraded: state.degraded,
    reason: state.reason,
    fallbackAvailable: config.allowLocalFallback,
    lastError: state.lastError,
  }
}

/** Best-effort connectivity check for the startup banner. */
export async function checkStore() {
  try {
    await primary().ping()
    return describeStore()
  } catch (err) {
    if ((err instanceof SupabaseUnreachable || err instanceof SupabaseUnusable) && config.allowLocalFallback) {
      state.degraded = true
      state.reason = err instanceof SupabaseUnreachable ? 'unreachable' : 'rejected'
      state.fallbackUntil = Date.now() + FALLBACK_WINDOW_MS
      state.lastError = err.message
    } else {
      state.lastError = String(err.message || err)
    }
    return describeStore()
  }
}
