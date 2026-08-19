// Local backend: a SQLite file on disk. Table names mirror supabase/schema.sql
// (all prefixed `preview_`) so the two backends stay interchangeable. Used for development, and as the
// fallback when Supabase is unreachable on a machine that actually has a disk.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { newSlug, normaliseEmail } from './shared.js'

let db = null

async function open() {
  if (db) return db
  let Database
  try {
    ({ default: Database } = await import('better-sqlite3'))
  } catch (err) {
    throw new Error(
      `Local SQLite storage is unavailable (${err.message}). Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or install better-sqlite3.`
    )
  }

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true })
  db = new Database(config.dbFile)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS preview_users (
      id          TEXT PRIMARY KEY,
      provider    TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      email       TEXT,
      name        TEXT,
      avatar      TEXT,
      created_at  INTEGER NOT NULL,
      UNIQUE (provider, provider_id)
    );

    CREATE TABLE IF NOT EXISTS preview_shares (
      slug         TEXT PRIMARY KEY,
      owner_id     TEXT NOT NULL REFERENCES preview_users(id),
      title        TEXT NOT NULL,
      visibility   TEXT NOT NULL DEFAULT 'invite',
      workspace    TEXT NOT NULL,
      preview_html TEXT,
      views        INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preview_share_invites (
      slug  TEXT NOT NULL REFERENCES preview_shares(slug) ON DELETE CASCADE,
      email TEXT NOT NULL,
      PRIMARY KEY (slug, email)
    );

    CREATE INDEX IF NOT EXISTS preview_shares_owner_idx ON preview_shares (owner_id, updated_at DESC);
  `)
  return db
}

const shape = (row, invites) => ({
  slug: row.slug,
  ownerId: row.owner_id,
  title: row.title,
  visibility: row.visibility,
  workspace: JSON.parse(row.workspace),
  previewHtml: row.preview_html,
  views: row.views,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  invites,
})

export const sqliteStore = {
  mode: 'sqlite',

  async ping() {
    await open()
    return true
  },

  users: {
    async upsert({ provider, providerId, email, name, avatar }) {
      const handle = await open()
      const existing = handle
        .prepare('SELECT * FROM preview_users WHERE provider = ? AND provider_id = ?')
        .get(provider, String(providerId))
      if (existing) {
        handle
          .prepare('UPDATE preview_users SET email = ?, name = ?, avatar = ? WHERE id = ?')
          .run(email ?? existing.email, name ?? existing.name, avatar ?? existing.avatar, existing.id)
        return sqliteStore.users.byId(existing.id)
      }
      const id = crypto.randomUUID()
      handle
        .prepare(
          'INSERT INTO preview_users (id, provider, provider_id, email, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, provider, String(providerId), email || null, name || null, avatar || null, Date.now())
      return sqliteStore.users.byId(id)
    },

    async byId(id) {
      const handle = await open()
      return handle.prepare('SELECT * FROM preview_users WHERE id = ?').get(id) || null
    },
  },

  shares: {
    async create({ ownerId, title, workspace, previewHtml, visibility, invites }) {
      const handle = await open()
      const slug = newSlug()
      const now = Date.now()
      handle
        .prepare(
          `INSERT INTO preview_shares (slug, owner_id, title, visibility, workspace, preview_html, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(slug, ownerId, title, visibility, JSON.stringify(workspace), previewHtml || null, now, now)
      await sqliteStore.shares.setInvites(slug, invites)
      return sqliteStore.shares.bySlug(slug)
    },

    async update(slug, { title, workspace, previewHtml, visibility, invites }) {
      const handle = await open()
      const current = await sqliteStore.shares.bySlug(slug)
      if (!current) return null
      handle
        .prepare(
          `UPDATE preview_shares SET title = ?, visibility = ?, workspace = ?, preview_html = ?, updated_at = ? WHERE slug = ?`
        )
        .run(
          title ?? current.title,
          visibility ?? current.visibility,
          JSON.stringify(workspace ?? current.workspace),
          previewHtml === undefined ? current.previewHtml : previewHtml,
          Date.now(),
          slug
        )
      if (invites) await sqliteStore.shares.setInvites(slug, invites)
      return sqliteStore.shares.bySlug(slug)
    },

    async setInvites(slug, invites = []) {
      const handle = await open()
      const clean = [...new Set(invites.map(normaliseEmail).filter(Boolean))]
      handle.prepare('DELETE FROM preview_share_invites WHERE slug = ?').run(slug)
      const insert = handle.prepare('INSERT OR IGNORE INTO preview_share_invites (slug, email) VALUES (?, ?)')
      handle.transaction((rows) => rows.forEach((email) => insert.run(slug, email)))(clean)
      return clean
    },

    async bySlug(slug) {
      const handle = await open()
      const row = handle.prepare('SELECT * FROM preview_shares WHERE slug = ?').get(slug)
      if (!row) return null
      const invites = handle
        .prepare('SELECT email FROM preview_share_invites WHERE slug = ? ORDER BY email')
        .all(slug)
        .map((r) => r.email)
      return shape(row, invites)
    },

    async listByOwner(ownerId) {
      const handle = await open()
      const rows = handle
        .prepare('SELECT slug FROM preview_shares WHERE owner_id = ? ORDER BY updated_at DESC')
        .all(ownerId)
      return Promise.all(rows.map((row) => sqliteStore.shares.bySlug(row.slug)))
    },

    async remove(slug) {
      const handle = await open()
      handle.prepare('DELETE FROM preview_share_invites WHERE slug = ?').run(slug)
      return handle.prepare('DELETE FROM preview_shares WHERE slug = ?').run(slug).changes > 0
    },

    async countView(slug) {
      const handle = await open()
      handle.prepare('UPDATE preview_shares SET views = views + 1 WHERE slug = ?').run(slug)
    },
  },
}
