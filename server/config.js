import 'dotenv/config'

const bool = (value) => value === '1' || value === 'true'

const port = Number(process.env.PORT || 8787)
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '')

export const config = {
  port,
  baseUrl,
  isProduction: process.env.NODE_ENV === 'production',
  secure: baseUrl.startsWith('https://'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-secret-change-me',
  dbFile: process.env.DB_FILE || 'data/shares.db',
  maxWorkspaceBytes: Number(process.env.MAX_WORKSPACE_BYTES || 2_000_000),
  // Lets you sign in as an arbitrary email without registering OAuth apps.
  // Never enable this on a deployed instance.
  allowDevLogin: bool(process.env.ALLOW_DEV_LOGIN) && process.env.NODE_ENV !== 'production',
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

export function describeConfig() {
  const providers = [
    config.google.enabled && 'google',
    config.github.enabled && 'github',
    config.allowDevLogin && 'dev-login',
  ].filter(Boolean)
  return {
    baseUrl: config.baseUrl,
    providers,
    warnings: [
      !config.google.enabled && !config.github.enabled && !config.allowDevLogin
        ? 'No sign-in provider configured — set GOOGLE_* or GITHUB_* in .env, or ALLOW_DEV_LOGIN=1 for local testing.'
        : null,
      config.isProduction && config.sessionSecret === 'development-only-secret-change-me'
        ? 'SESSION_SECRET is unset — sessions can be forged. Set it before serving real traffic.'
        : null,
    ].filter(Boolean),
  }
}
