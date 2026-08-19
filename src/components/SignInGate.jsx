import { useState } from 'react'
import { devSignIn, signInUrl } from '../lib/api.js'
import { GitHubIcon, GoogleIcon } from './ProviderIcons.jsx'

const HIGHLIGHTS = [
  {
    title: 'Renders as designed',
    body: 'Tailwind is detected from the markup itself, so a design shows up styled — not as unstyled HTML.',
  },
  {
    title: 'Dependencies in one click',
    body: 'Every npm import your file needs is listed and pinned to a version you choose.',
  },
  {
    title: 'Share by link',
    body: 'Publish a preview to anyone with the link, or only to the people you invite by email.',
  },
]

const PROVIDER_META = {
  google: { icon: GoogleIcon, className: 'provider-google' },
  github: { icon: GitHubIcon, className: 'provider-github' },
}

export default function SignInGate({ providers }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const oauth = providers.filter((p) => p.id !== 'dev')
  const dev = providers.some((p) => p.id === 'dev')

  const signInDev = () => {
    setBusy(true)
    devSignIn(email)
      .then(() => location.reload())
      .catch((err) => {
        setError(err.message)
        setBusy(false)
      })
  }

  return (
    <div className="gate">
      <div className="gate-grid">
        <section className="gate-pitch">
          <img className="gate-logo" src="/uniflex.png" alt="Uniflex" width="200" />
          <h1>
            Drop a component in.
            <br />
            Watch it render.
          </h1>
          <p className="gate-lede">
            A development preview for single files and whole folders — compiled in your browser,
            rendered in a sandbox, and shareable the moment it works.
          </p>

          <ul className="gate-highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title}>
                <span className="gate-tick" aria-hidden="true">✓</span>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="gate-card">
          <div className="gate-card-head">
            <h2>Sign in to continue</h2>
            <p>Your uploads are saved to your account, and you decide who can see each preview.</p>
          </div>

          <div className="gate-actions">
            {oauth.map((provider) => {
              const meta = PROVIDER_META[provider.id] || {}
              const Icon = meta.icon
              return (
                <a
                  key={provider.id}
                  className={`provider-btn ${meta.className || ''}`}
                  href={signInUrl(provider.id, '/')}
                >
                  {Icon ? <Icon size={18} /> : null}
                  <span>Continue with {provider.label}</span>
                </a>
              )
            })}
          </div>

          {oauth.length === 0 && !dev && (
            <p className="share-warn" style={{ marginTop: 0 }}>
              No sign-in provider is configured on this server. Set <code>GOOGLE_*</code> or{' '}
              <code>GITHUB_*</code> in the environment and restart it.
            </p>
          )}

          {dev && (
            <div className="gate-dev">
              <div className="gate-divider"><span>or, on this machine</span></div>
              <div className="share-actions">
                <input
                  className="field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && email && signInDev()}
                />
                <button className="btn tiny" disabled={!email || busy} onClick={signInDev}>
                  {busy ? '…' : 'Dev sign-in'}
                </button>
              </div>
              {error && <p className="share-warn">{error}</p>}
            </div>
          )}

          <p className="gate-fineprint">
            We store your email address to keep your projects together and to check invite lists.
            Nothing is posted on your behalf.
          </p>
        </section>
      </div>

      <footer className="gate-footer">
        <img className="gate-footer-mark" src="/U.png" alt="" width="22" height="22" />
        <p className="gate-footer-line">
          Powered by <strong>Uniflex</strong>
          <span className="gate-footer-x" aria-hidden="true">×</span>
          <strong>Digitalization Team</strong>
        </p>
        <span className="gate-footer-sep" aria-hidden="true" />
        <p className="gate-footer-credit">
          <span className="gate-footer-c" aria-hidden="true">&copy;</span>
          <span className="sr-only">Copyright</span> Uniflex 2026
        </p>
      </footer>
    </div>
  )
}
