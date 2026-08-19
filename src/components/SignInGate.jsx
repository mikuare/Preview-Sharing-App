import { useState } from 'react'
import { devSignIn, signInUrl } from '../lib/api.js'

/**
 * Shown instead of the editor until someone signs in. Uploads belong to an
 * account, so the account comes first.
 */
export default function SignInGate({ providers, onOffline, offlineAllowed }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const oauth = providers.filter((p) => p.id !== 'dev')
  const dev = providers.some((p) => p.id === 'dev')

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="dot" />
          Development Preview
          <small>live</small>
        </div>

        <h1>Sign in to start</h1>
        <p>
          Drop a component file in and it renders — with Tailwind, icons, charts or anything else it
          imports, installed in one click. Your uploads are saved to your account, and you decide who
          can see each preview: anyone with the link, or only the people you invite.
        </p>

        <div className="gate-actions">
          {oauth.map((provider) => (
            <a key={provider.id} className="btn primary gate-btn" href={signInUrl(provider.id, '/')}>
              Continue with {provider.label}
            </a>
          ))}
        </div>

        {oauth.length === 0 && !dev && (
          <p className="share-warn">
            No sign-in provider is configured on this server. Set GOOGLE_* or GITHUB_* in the
            environment, then restart it.
          </p>
        )}

        {dev && (
          <div className="gate-dev">
            <p>Dev sign-in is enabled on this server (local testing only).</p>
            <div className="share-actions">
              <input
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && email && devSignIn(email).then(() => location.reload())}
              />
              <button
                className="btn tiny"
                onClick={() =>
                  devSignIn(email)
                    .then(() => location.reload())
                    .catch((err) => setError(err.message))
                }
              >
                Sign in
              </button>
            </div>
            {error && <p className="share-warn">{error}</p>}
          </div>
        )}

        {offlineAllowed && (
          <button className="btn ghost gate-offline" onClick={onOffline}>
            Continue without an account — files stay in this browser
          </button>
        )}
      </div>
    </div>
  )
}
