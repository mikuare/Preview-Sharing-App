import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { config } from './config.js'

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true })

export const db = new Database(config.dbFile)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    email       TEXT,
    name        TEXT,
    avatar      TEXT,
    created_at  INTEGER NOT NULL,
    UNIQUE (provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS shares (
    slug         TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL REFERENCES users(id),
    title        TEXT NOT NULL,
    visibility   TEXT NOT NULL DEFAULT 'invite',
    workspace    TEXT NOT NULL,
    preview_html TEXT,
    views        INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS share_invites (
    slug  TEXT NOT NULL REFERENCES shares(slug) ON DELETE CASCADE,
    email TEXT NOT NULL,
    PRIMARY KEY (slug, email)
  );

  CREATE INDEX IF NOT EXISTS shares_owner ON shares (owner_id, updated_at DESC);
`)

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newSlug(length = 10) {
  const bytes = crypto.randomBytes(length)
  let slug = ''
  for (const byte of bytes) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
  return slug
}

export const users = {
  upsert({ provider, providerId, email, name, avatar }) {
    const existing = db
      .prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?')
      .get(provider, String(providerId))
    if (existing) {
      db.prepare('UPDATE users SET email = ?, name = ?, avatar = ? WHERE id = ?').run(
        email ?? existing.email,
        name ?? existing.name,
        avatar ?? existing.avatar,
        existing.id
      )
      return users.byId(existing.id)
    }
    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO users (id, provider, provider_id, email, name, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, provider, String(providerId), email || null, name || null, avatar || null, Date.now())
    return users.byId(id)
  },
  byId(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  },
}

const normaliseEmail = (email) => String(email || '').trim().toLowerCase()

export const shares = {
  create({ ownerId, title, workspace, previewHtml, visibility, invites }) {
    const slug = newSlug()
    const now = Date.now()
    db.prepare(
      `INSERT INTO shares (slug, owner_id, title, visibility, workspace, preview_html, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(slug, ownerId, title, visibility, JSON.stringify(workspace), previewHtml || null, now, now)
    shares.setInvites(slug, invites)
    return shares.bySlug(slug)
  },

  update(slug, { title, workspace, previewHtml, visibility, invites }) {
    const current = shares.bySlug(slug)
    if (!current) return null
    db.prepare(
      `UPDATE shares SET title = ?, visibility = ?, workspace = ?, preview_html = ?, updated_at = ?
       WHERE slug = ?`
    ).run(
      title ?? current.title,
      visibility ?? current.visibility,
      workspace ? JSON.stringify(workspace) : JSON.stringify(current.workspace),
      previewHtml === undefined ? current.previewHtml : previewHtml,
      Date.now(),
      slug
    )
    if (invites) shares.setInvites(slug, invites)
    return shares.bySlug(slug)
  },

  setInvites(slug, invites = []) {
    const clean = [...new Set(invites.map(normaliseEmail).filter(Boolean))]
    db.prepare('DELETE FROM share_invites WHERE slug = ?').run(slug)
    const insert = db.prepare('INSERT OR IGNORE INTO share_invites (slug, email) VALUES (?, ?)')
    const many = db.transaction((rows) => rows.forEach((email) => insert.run(slug, email)))
    many(clean)
    return clean
  },

  bySlug(slug) {
    const row = db.prepare('SELECT * FROM shares WHERE slug = ?').get(slug)
    if (!row) return null
    return {
      ...row,
      workspace: JSON.parse(row.workspace),
      previewHtml: row.preview_html,
      invites: db
        .prepare('SELECT email FROM share_invites WHERE slug = ? ORDER BY email')
        .all(slug)
        .map((r) => r.email),
    }
  },

  listByOwner(ownerId) {
    return db
      .prepare('SELECT slug FROM shares WHERE owner_id = ? ORDER BY updated_at DESC')
      .all(ownerId)
      .map((row) => shares.bySlug(row.slug))
  },

  remove(slug) {
    db.prepare('DELETE FROM share_invites WHERE slug = ?').run(slug)
    return db.prepare('DELETE FROM shares WHERE slug = ?').run(slug).changes > 0
  },

  countView(slug) {
    db.prepare('UPDATE shares SET views = views + 1 WHERE slug = ?').run(slug)
  },

  /** Can this viewer see the share? Returns 'ok' | 'signin' | 'forbidden'. */
  access(share, viewer) {
    if (share.visibility === 'public') return 'ok'
    if (!viewer) return 'signin'
    if (viewer.id === share.owner_id) return 'ok'
    const email = normaliseEmail(viewer.email)
    return email && share.invites.includes(email) ? 'ok' : 'forbidden'
  },
}
