// Sign-in with Google or GitHub, plus signed-cookie sessions. No auth library:
// the OAuth 2.0 authorization-code flow is short enough to read in one sitting.

import crypto from 'node:crypto'
import { config } from './config.js'
import { users } from './store/index.js'

const SESSION_COOKIE = 'dp_session'
const STATE_COOKIE = 'dp_oauth'
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000

const b64url = (buf) => Buffer.from(buf).toString('base64url')

function sign(payload, ttlMs) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }))
  const mac = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

export function readCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.secure,
  path: '/',
  maxAge,
})

export async function currentUser(req) {
  const session = verify(readCookies(req)[SESSION_COOKIE])
  if (!session) return null
  return (await users.byId(session.uid)) || null
}

export async function requireUser(req, res, next) {
  try {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'sign-in required' })
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

export const publicUser = (user) =>
  user && { id: user.id, email: user.email, name: user.name, avatar: user.avatar, provider: user.provider }

// --- providers --------------------------------------------------------------

const PROVIDERS = {
  google: {
    label: 'Google',
    scope: 'openid email profile',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    get credentials() {
      return config.google
    },
    async profile(accessToken) {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) throw new Error(`Google profile lookup failed (${res.status})`)
      const me = await res.json()
      return { providerId: me.sub, email: me.email, name: me.name, avatar: me.picture }
    },
  },

  github: {
    label: 'GitHub',
    scope: 'read:user user:email',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    get credentials() {
      return config.github
    },
    async profile(accessToken) {
      const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }
      const res = await fetch('https://api.github.com/user', { headers })
      if (!res.ok) throw new Error(`GitHub profile lookup failed (${res.status})`)
      const me = await res.json()
      let email = me.email
      if (!email) {
        // A GitHub account with a private email needs the separate endpoint.
        const emails = await fetch('https://api.github.com/user/emails', { headers })
        if (emails.ok) {
          const list = await emails.json()
          email = (list.find((e) => e.primary && e.verified) || list.find((e) => e.verified) || {}).email
        }
      }
      return { providerId: me.id, email, name: me.name || me.login, avatar: me.avatar_url }
    },
  },
}

export function enabledProviders() {
  const list = Object.entries(PROVIDERS)
    .filter(([, provider]) => provider.credentials.enabled)
    .map(([id, provider]) => ({ id, label: provider.label }))
  if (config.allowDevLogin) list.push({ id: 'dev', label: 'Dev sign-in' })
  return list
}

const safeReturn = (value) => (typeof value === 'string' && /^\/[^/\\]/.test(value) ? value : '/')

export function mountAuth(app) {
  app.get('/api/auth/providers', async (req, res, next) => {
    try {
      res.json({ providers: enabledProviders(), user: publicUser(await currentUser(req)) })
    } catch (err) {
      next(err)
    }
  })

  app.get('/auth/:provider', (req, res) => {
    const provider = PROVIDERS[req.params.provider]
    if (!provider || !provider.credentials.enabled) {
      return res.status(404).send('That sign-in provider is not configured on this server.')
    }
    const nonce = crypto.randomBytes(16).toString('hex')
    res.cookie(STATE_COOKIE, sign({ nonce, returnTo: safeReturn(req.query.returnTo) }, 10 * 60 * 1000), cookieOptions(600_000))
    const url = new URL(provider.authorizeUrl)
    url.searchParams.set('client_id', provider.credentials.clientId)
    url.searchParams.set('redirect_uri', `${config.baseUrl}/auth/${req.params.provider}/callback`)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', provider.scope)
    url.searchParams.set('state', nonce)
    res.redirect(url.toString())
  })

  app.get('/auth/:provider/callback', async (req, res) => {
    const key = req.params.provider
    const provider = PROVIDERS[key]
    const state = verify(readCookies(req)[STATE_COOKIE])
    res.clearCookie(STATE_COOKIE, { path: '/' })

    if (!provider || !provider.credentials.enabled) return res.status(404).send('Unknown sign-in provider.')
    if (!state || state.nonce !== req.query.state) {
      return res.status(400).send('Sign-in could not be verified (state mismatch). Please try again.')
    }
    if (req.query.error) return res.status(400).send(`Sign-in was cancelled: ${req.query.error}`)

    try {
      const tokenRes = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: provider.credentials.clientId,
          client_secret: provider.credentials.clientSecret,
          code: String(req.query.code || ''),
          grant_type: 'authorization_code',
          redirect_uri: `${config.baseUrl}/auth/${key}/callback`,
        }),
      })
      const token = await tokenRes.json()
      if (!token.access_token) throw new Error(token.error_description || token.error || 'no access token returned')

      const profile = await provider.profile(token.access_token)
      if (!profile.email) {
        throw new Error('That account has no verified email address, so it cannot be matched to an invite.')
      }
      const user = await users.upsert({ provider: key, ...profile })
      res.cookie(SESSION_COOKIE, sign({ uid: user.id }, SESSION_TTL), cookieOptions(SESSION_TTL))
      // appOrigin is the same host in production; locally it points back at the
      // Vite dev server rather than this API port.
      res.redirect(`${config.appOrigin}${state.returnTo || '/'}`)
    } catch (err) {
      res.status(502).send(`Sign-in with ${provider.label} failed: ${err.message}`)
    }
  })

  // Local testing only: skips the provider round-trip so the share flow can be
  // exercised without registering OAuth apps. Disabled unless ALLOW_DEV_LOGIN=1.
  app.post('/auth/dev', async (req, res, next) => {
    if (!config.allowDevLogin) return res.status(404).json({ error: 'dev sign-in is disabled' })
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'email required' })
    try {
      const user = await users.upsert({ provider: 'dev', providerId: email, email, name: email.split('@')[0], avatar: null })
      res.cookie(SESSION_COOKIE, sign({ uid: user.id }, SESSION_TTL), cookieOptions(SESSION_TTL))
      res.json({ user: publicUser(user) })
    } catch (err) {
      next(err)
    }
  })

  app.post('/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    res.json({ ok: true })
  })
}
