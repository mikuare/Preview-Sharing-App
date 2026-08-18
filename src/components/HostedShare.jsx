import { useEffect, useState } from 'react'
import {
  authProviders,
  createShare,
  deleteShare,
  devSignIn,
  listShares,
  serverStatus,
  signInUrl,
  signOut,
  updateShare,
} from '../lib/api.js'
import { copyText } from '../lib/share.js'

const parseInvites = (text) =>
  text
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'))

export default function HostedShare({ workspace, previewHtml, defaultTitle }) {
  const [status, setStatus] = useState({ state: 'checking' })
  const [providers, setProviders] = useState([])
  const [mine, setMine] = useState([])
  const [title, setTitle] = useState(defaultTitle)
  const [visibility, setVisibility] = useState('invite')
  const [invites, setInvites] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const [note, setNote] = useState('')

  const refresh = async () => {
    const me = await serverStatus()
    if (!me) {
      setStatus({ state: 'offline' })
      return
    }
    setStatus({ state: me.user ? 'ready' : 'anonymous', user: me.user, config: me.config })
    const { providers: list } = await authProviders()
    setProviders(list)
    if (me.user) setMine((await listShares()).shares)
  }

  useEffect(() => {
    refresh().catch((err) => setStatus({ state: 'offline', message: err.message }))
  }, [])

  if (status.state === 'checking') {
    return <div className="share-row"><span className="spin" /> checking share server…</div>
  }

  if (status.state === 'offline') {
    return (
      <div className="share-row">
        <div className="share-title">Hosted link</div>
        <p>
          The share server is not running. Start it with <code>npm run dev:all</code> (or{' '}
          <code>npm run server</code>) to create links that other people can open with a Google or
          GitHub account.
        </p>
      </div>
    )
  }

  if (status.state === 'anonymous') {
    const oauth = providers.filter((p) => p.id !== 'dev')
    return (
      <div className="share-row">
        <div className="share-title">Hosted link</div>
        <p>Sign in to save this preview on the server and get a short link you control.</p>
        <div className="share-actions">
          {oauth.map((provider) => (
            <a key={provider.id} className="btn tiny primary" href={signInUrl(provider.id)}>
              Sign in with {provider.label}
            </a>
          ))}
          {oauth.length === 0 && <span className="share-meta">No OAuth provider is configured on the server.</span>}
        </div>
        {providers.some((p) => p.id === 'dev') && <DevSignIn onDone={refresh} />}
      </div>
    )
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = {
        title: title.trim() || 'Untitled preview',
        workspace,
        previewHtml,
        visibility,
        invites: parseInvites(invites),
      }
      const { share } = await createShare(payload)
      setCreated(share)
      setMine((await listShares()).shares)
      await copyText(share.url)
      setNote('Link created and copied.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const republish = async (slug) => {
    setBusy(true)
    setError('')
    try {
      const { share } = await updateShare(slug, { workspace, previewHtml })
      setNote(`Updated ${share.slug} with the current preview.`)
      setMine((await listShares()).shares)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-row">
      <div className="share-title">Hosted link</div>
      <p>
        Saved on your share server as a short link. Signed in as <strong>{status.user.email}</strong>.
      </p>

      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />

      <div className="share-actions">
        <select className="field" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="invite">Only people I invite</option>
          <option value="public">Anyone with the link</option>
        </select>
        <button className="btn tiny primary" disabled={busy} onClick={submit}>
          {busy ? 'Working…' : 'Create link'}
        </button>
      </div>

      {visibility === 'invite' && (
        <textarea
          className="field"
          rows={2}
          style={{ marginTop: 8, resize: 'vertical' }}
          placeholder="Invite by email — they sign in with Google or GitHub using that address"
          value={invites}
          onChange={(e) => setInvites(e.target.value)}
        />
      )}

      {created && (
        <div className="share-created">
          <input className="field" readOnly value={created.url} onFocus={(e) => e.target.select()} />
          <div className="share-actions">
            <button className="btn tiny" onClick={() => copyText(created.url).then(() => setNote('Link copied.'))}>
              Copy
            </button>
            <a className="btn tiny ghost" href={created.url} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="share-list">
          <div className="share-meta" style={{ margin: '10px 0 6px' }}>Your links</div>
          {mine.map((share) => (
            <div className="share-item" key={share.slug}>
              <div className="share-item-main">
                <span className="share-item-title">{share.title}</span>
                <span className="share-meta">
                  /s/{share.slug} · {share.visibility === 'public' ? 'anyone with the link' : `${share.invites.length} invited`} ·{' '}
                  {share.views} view{share.views === 1 ? '' : 's'}
                </span>
              </div>
              <button className="btn tiny ghost" title="Replace with the current preview" onClick={() => republish(share.slug)}>
                Update
              </button>
              <button className="btn tiny ghost" onClick={() => copyText(share.url).then(() => setNote('Link copied.'))}>
                Copy
              </button>
              <button
                className="btn tiny ghost danger"
                onClick={async () => {
                  await deleteShare(share.slug)
                  setMine((await listShares()).shares)
                  if (created?.slug === share.slug) setCreated(null)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="share-warn">{error}</p>}
      {note && <p className="share-meta" style={{ marginTop: 8 }}>{note}</p>}

      <div className="share-actions" style={{ marginTop: 10 }}>
        <button className="btn tiny ghost" onClick={() => signOut().then(refresh)}>
          Sign out
        </button>
      </div>
    </div>
  )
}

function DevSignIn({ onDone }) {
  const [email, setEmail] = useState('')
  return (
    <div className="share-actions" style={{ marginTop: 8 }}>
      <input className="field" placeholder="dev sign-in: you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn tiny" onClick={() => devSignIn(email).then(onDone)}>
        Sign in
      </button>
    </div>
  )
}
