import 'dotenv/config'

const bool = (value) => value === '1' || value === 'true'

const port = Number(process.env.PORT || 8787)
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '')

// Vercel runs each request in a fresh, read-only container: no disk to keep a
// database on, and no long-lived process. That drives most of the choices here.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
const isProduction = process.env.NODE_ENV === 'production' || isServerless

/**
 * Supabase keys are JWTs carrying a `role` claim (or, in the newer format, a
 * `sb_secret_` / `sb_publishable_` prefix). An anon/publishable key pasted into
 * the service-role slot cannot read a single row once RLS is on, so name the
 * problem at boot instead of leaving a wall of 401s to interpret.
 */
function describeKey(key) {
  if (!key) return null
  if (key.startsWith('sb_secret_')) return 'service_role'
  if (key.startsWith('sb_publishable_')) return 'anon'
  const parts = key.split('.')
  if (parts.length !== 3) return 'unknown'
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role || 'unknown'
  } catch {
    return 'unknown'
  }
}

const supabase = {
  url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  timeoutMs: Number(process.env.SUPABASE_TIMEOUT_MS || 8000),
  get keyRole() {
    return describeKey(this.serviceKey)
  },
  get enabled() {
    return Boolean(this.url && this.serviceKey)
  },
}

export const config = {
  port,
  baseUrl,
  // Where to send people after sign-in. Locally the API lives on :8787 while the
  // editor is served by Vite on :5173; on Vercel both are the same origin.
  appOrigin: (process.env.APP_ORIGIN || baseUrl).replace(/\/+$/, ''),
  isProduction,
  isServerless,
  secure: baseUrl.startsWith('https://'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-secret-change-me',
  dbFile: process.env.DB_FILE || 'data/shares.db',
  maxWorkspaceBytes: Number(process.env.MAX_WORKSPACE_BYTES || 2_000_000),
  // Lets you sign in as an arbitrary email without registering OAuth apps.
  // Never enable this on a deployed instance.
  allowDevLogin: bool(process.env.ALLOW_DEV_LOGIN) && !isProduction,
  supabase,
  // If Supabase cannot be reached, fall back to the local SQLite file — only
  // where there is a real disk. On serverless that would be an ephemeral write
  // that quietly loses data, so it stays off.
  allowLocalFallback:
    process.env.ALLOW_LOCAL_FALLBACK === undefined ? !isServerless : bool(process.env.ALLOW_LOCAL_FALLBACK),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    get enabled() {
      return Boolean(this.clientId && this.clientSecret)
    },
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    get enabled() {
      return Boolean(this.clientId && this.clientSecret)
    },
  },
}

// A production instance with a guessable session secret is a forgeable session,
// so refuse to start rather than warn about it.
if (config.isProduction && config.sessionSecret === 'development-only-secret-change-me') {
  throw new Error(
    'SESSION_SECRET is not set. Generate one with `node -e "console.log(crypto.randomUUID())"` and add it to the environment.'
  )
}

export function describeConfig(storage) {
  const providers = [
    config.google.enabled && 'google',
    config.github.enabled && 'github',
    config.allowDevLogin && 'dev-login',
  ].filter(Boolean)

  return {
    baseUrl: config.baseUrl,
    providers,
    storage: storage || null,
    warnings: [
      providers.length === 0
        ? 'No sign-in provider configured — set GOOGLE_* or GITHUB_* in the environment, or ALLOW_DEV_LOGIN=1 for local testing.'
        : null,
      config.isServerless && !config.supabase.enabled
        ? 'Running serverless without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — there is no persistent storage for shares.'
        : null,
      storage?.degraded
        ? storage.reason === 'rejected'
          ? 'Supabase rejected the request (wrong key, or the migration has not been applied — run `npm run db:push`); shares are being stored locally and are not visible to other instances.'
          : 'Supabase is unreachable; shares are being read and written locally and will not be visible to other instances.'
        : null,
      config.supabase.enabled && config.supabase.keyRole === 'anon'
        ? 'SUPABASE_SERVICE_ROLE_KEY holds an anon/publishable key. The preview_ tables have RLS enabled with no policies, so every query will fail — use the service_role key from Supabase → Settings → API.'
        : null,
      config.supabase.enabled && config.supabase.keyRole === 'unknown'
        ? 'SUPABASE_SERVICE_ROLE_KEY is not in a recognised Supabase key format.'
        : null,
    ].filter(Boolean),
  }
}
