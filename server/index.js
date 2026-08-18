// Share server: sign-in, saved projects, short links with per-link access.

import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import { config, describeConfig } from './config.js'
import { shares } from './db.js'
import { currentUser, mountAuth, publicUser, requireUser } from './auth.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

mountAuth(app)

// --- validation -------------------------------------------------------------

function readWorkspace(body) {
  const workspace = body?.workspace
  if (!workspace || !Array.isArray(workspace.files) || workspace.files.length === 0) {
    throw new Error('workspace.files is required')
  }
  for (const file of workspace.files) {
    if (typeof file?.name !== 'string' || typeof file?.content !== 'string') {
      throw new Error('each file needs a name and content')
    }
  }
  const clean = {
    files: workspace.files.map((f) => ({ name: f.name, content: f.content, size: f.content.length })),
    entryName: typeof workspace.entryName === 'string' ? workspace.entryName : workspace.files[0].name,
    installed: Array.isArray(workspace.installed) ? workspace.installed : [],
    reactVersion: typeof workspace.reactVersion === 'string' ? workspace.reactVersion : '18.3.1',
  }
  const bytes = Buffer.byteLength(JSON.stringify(clean))
  if (bytes > config.maxWorkspaceBytes) {
    throw new Error(`workspace is ${Math.round(bytes / 1024)} KB, over the ${Math.round(config.maxWorkspaceBytes / 1024)} KB limit`)
  }
  return clean
}

const readVisibility = (value) => (value === 'public' ? 'public' : 'invite')
const readInvites = (value) => (Array.isArray(value) ? value.slice(0, 200).map(String) : [])

const ownerView = (share) => ({
  slug: share.slug,
  title: share.title,
  visibility: share.visibility,
  invites: share.invites,
  views: share.views,
  updatedAt: share.updated_at,
  url: `${config.baseUrl}/s/${share.slug}`,
  fileCount: share.workspace.files.length,
})

// --- api --------------------------------------------------------------------

app.get('/api/me', (req, res) => {
  res.json({ user: publicUser(currentUser(req)), config: describeConfig() })
})

app.post('/api/shares', requireUser, (req, res) => {
  try {
    const share = shares.create({
      ownerId: req.user.id,
      title: String(req.body.title || 'Untitled preview').slice(0, 120),
      workspace: readWorkspace(req.body),
      previewHtml: typeof req.body.previewHtml === 'string' ? req.body.previewHtml : null,
      visibility: readVisibility(req.body.visibility),
      invites: readInvites(req.body.invites),
    })
    res.status(201).json({ share: ownerView(share) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/shares', requireUser, (req, res) => {
  res.json({ shares: shares.listByOwner(req.user.id).map(ownerView) })
})

app.patch('/api/shares/:slug', requireUser, (req, res) => {
  const share = shares.bySlug(req.params.slug)
  if (!share) return res.status(404).json({ error: 'not found' })
  if (share.owner_id !== req.user.id) return res.status(403).json({ error: 'not your share' })
  try {
    const updated = shares.update(req.params.slug, {
      title: req.body.title === undefined ? undefined : String(req.body.title).slice(0, 120),
      workspace: req.body.workspace ? readWorkspace(req.body) : undefined,
      previewHtml: req.body.previewHtml,
      visibility: req.body.visibility === undefined ? undefined : readVisibility(req.body.visibility),
      invites: req.body.invites === undefined ? undefined : readInvites(req.body.invites),
    })
    res.json({ share: ownerView(updated) })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.delete('/api/shares/:slug', requireUser, (req, res) => {
  const share = shares.bySlug(req.params.slug)
  if (!share) return res.status(404).json({ error: 'not found' })
  if (share.owner_id !== req.user.id) return res.status(403).json({ error: 'not your share' })
  shares.remove(req.params.slug)
  res.json({ ok: true })
})

/**
 * What a viewer gets. `state` tells the page whether to render, ask for
 * sign-in, or explain that this account is not on the invite list.
 */
app.get('/api/shares/:slug', (req, res) => {
  const share = shares.bySlug(req.params.slug)
  if (!share) return res.status(404).json({ state: 'missing' })

  const viewer = currentUser(req)
  const state = shares.access(share, viewer)
  const owner = viewer && viewer.id === share.owner_id

  if (state !== 'ok') {
    return res.status(state === 'signin' ? 401 : 403).json({
      state,
      title: share.title,
      viewer: publicUser(viewer),
    })
  }

  shares.countView(share.slug)
  res.json({
    state: 'ok',
    viewer: publicUser(viewer),
    share: {
      slug: share.slug,
      title: share.title,
      visibility: share.visibility,
      updatedAt: share.updated_at,
      workspace: share.workspace,
      // Rendered in a sandboxed iframe on the viewer page — never as a
      // top-level document on this origin.
      previewHtml: share.previewHtml,
      isOwner: Boolean(owner),
    },
  })
})

// --- static app -------------------------------------------------------------

const distDir = path.resolve('dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }))
  app.get(['/', '/s/:slug'], (req, res) => res.sendFile(path.join(distDir, 'index.html')))
} else {
  app.get(['/', '/s/:slug'], (req, res) =>
    res
      .status(503)
      .type('text/plain')
      .send('No build found. Run `npm run build`, or use `npm run dev:all` and open the Vite server on :5173.')
  )
}

app.listen(config.port, () => {
  const info = describeConfig()
  console.log(`share server  ${info.baseUrl}`)
  console.log(`sign-in       ${info.providers.length ? info.providers.join(', ') : 'none configured'}`)
  for (const warning of info.warnings) console.warn(`warning       ${warning}`)
})
