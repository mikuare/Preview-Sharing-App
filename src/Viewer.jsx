import { useCallback, useEffect, useState } from 'react'
import { authProviders, devSignIn, loadShare, signInUrl, signOut } from './lib/api.js'
import { buildBundle, ensureCompiler } from './lib/compile.js'
import { PREVIEW_ALLOW, PREVIEW_SANDBOX, buildPreviewHtml, previewColorScheme } from './lib/buildPreview.js'
import { encodeWorkspace } from './lib/share.js'

function SignInCard({ title, message, providers, children }) {
  return (
    <div className="viewer-card">
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="viewer-actions">
        {providers.map((provider) =>
          provider.id === 'dev' ? null : (
            <a key={provider.id} className="btn primary" href={signInUrl(provider.id)}>
              Sign in with {provider.label}
            </a>
          )
        )}
      </div>
      {children}
    </div>
  )
}

export default function Viewer({ slug }) {
  const [result, setResult] = useState({ state: 'loading' })
  const [providers, setProviders] = useState([])
  const [html, setHtml] = useState(null)
  const [buildError, setBuildError] = useState('')
  const [runtime, setRuntime] = useState({ state: 'idle' })


  // The preview reports back from inside the iframe, so a viewer sees why a
  // shared preview failed instead of a blank rectangle.
  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data
      if (!data || data.__dp !== true) return
      if (data.type === 'ready') setRuntime({ state: 'ready', ms: data.ms })
      else if (data.type === 'error') setRuntime({ state: 'error', detail: `${data.title}\n${data.detail}` })
      else if (data.type === 'boot') setRuntime({ state: 'running' })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    loadShare(slug).then(setResult)
    authProviders()
      .then((data) => setProviders(data.providers))
      .catch(() => setProviders([]))
  }, [slug])

  // Shares store a rendered snapshot; if one is missing, rebuild it here from
  // the saved workspace so old links keep working.
  useEffect(() => {
    if (result.state !== 'ok') return
    if (result.share.previewHtml) {
      setHtml(result.share.previewHtml)
      return
    }
    let alive = true
    ;(async () => {
      try {
        await ensureCompiler()
        const { workspace } = result.share
        const bundle = buildBundle(workspace.files, workspace.entryName)
        const fatal = bundle.errors.filter((e) => e.kind === 'syntax' || e.kind === 'cycle')
        if (fatal.length) throw new Error(fatal.map((e) => `${e.file}: ${e.message}`).join('\n'))
        const built = buildPreviewHtml({
          bundle,
          installed: workspace.installed || [],
          files: workspace.files,
          reactVersion: workspace.reactVersion || '18.3.1',
        })
        if (alive) setHtml(built)
      } catch (err) {
        if (alive) setBuildError(err.message)
      }
    })()
    return () => {
      alive = false
    }
  }, [result])

  const openCopy = useCallback(async () => {
    const token = await encodeWorkspace(result.share.workspace)
    window.open(`/#project=${token}`, '_blank')
  }, [result])

  if (result.state === 'loading') {
    return <div className="viewer-shell"><div className="viewer-card"><span className="spin" /> Loading shared preview…</div></div>
  }

  if (result.state === 'missing') {
    return (
      <div className="viewer-shell">
        <div className="viewer-card">
          <h1>This link no longer exists</h1>
          <p>The share was deleted, or the address is mistyped.</p>
        </div>
      </div>
    )
  }

  if (result.state === 'signin') {
    return (
      <div className="viewer-shell">
        <SignInCard
          title={result.title || 'Private preview'}
          message="Whoever shared this limited it to invited people. Sign in with the account it was sent to."
          providers={providers}
        >
          {providers.some((p) => p.id === 'dev') && <DevSignIn />}
        </SignInCard>
      </div>
    )
  }

  if (result.state === 'forbidden') {
    return (
      <div className="viewer-shell">
        <div className="viewer-card">
          <h1>Not on the invite list</h1>
          <p>
            You are signed in as <strong>{result.viewer?.email}</strong>, which is not one of the invited
            addresses for this preview. Ask for an invite, or switch accounts.
          </p>
          <div className="viewer-actions">
            <button className="btn" onClick={() => signOut().then(() => location.reload())}>
              Sign out and try another account
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (result.state === 'error') {
    return (
      <div className="viewer-shell">
        <div className="viewer-card">
          <h1>Could not load this preview</h1>
          <p>{result.message}</p>
        </div>
      </div>
    )
  }

  const { share, viewer } = result

  return (
    <div className="viewer">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          {share.title}
          <small>{share.visibility === 'public' ? 'shared link' : 'invited only'}</small>
        </div>
        <span className="spacer" />
        <span className="share-meta">
          {runtime.state === 'ready' && `mounted in ${runtime.ms}ms`}
          {runtime.state === 'error' && 'preview error'}
          {(runtime.state === 'idle' || runtime.state === 'running') && 'loading…'}
        </span>
        {viewer && <span className="share-meta">{viewer.email}</span>}
        <button className="btn tiny" onClick={openCopy}>Open a copy in the editor</button>
        {viewer && (
          <button className="btn tiny ghost" onClick={() => signOut().then(() => location.reload())}>
            Sign out
          </button>
        )}
      </header>

      {runtime.state === 'error' && (
        <div className="viewer-error">
          <strong>The preview reported an error.</strong> {runtime.detail.split('\n')[0]}
        </div>
      )}

      <div className="viewer-stage">
        {buildError ? (
          <div className="error-card">
            <h3>This preview could not be rebuilt</h3>
            <pre>{buildError}</pre>
          </div>
        ) : html ? (
          <div className="frame">
            <iframe
              title={share.title}
              sandbox={PREVIEW_SANDBOX}
              allow={PREVIEW_ALLOW}
              style={{ colorScheme: previewColorScheme(share.workspace?.previewTheme) }}
              srcDoc={html}
            />
          </div>
        ) : (
          <div className="viewer-card"><span className="spin" /> Building preview…</div>
        )}
      </div>
    </div>
  )
}

function DevSignIn() {
  const [email, setEmail] = useState('')
  return (
    <div className="viewer-dev">
      <p>Dev sign-in is enabled on this server (local testing only).</p>
      <div className="share-actions">
        <input className="field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button
          className="btn tiny"
          onClick={async () => {
            await devSignIn(email)
            location.reload()
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  )
}
