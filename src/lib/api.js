// Thin wrapper over the share server. Every call carries the session cookie.

async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`)
    error.status = res.status
    error.data = data
    throw error
  }
  return data
}

/** Is a share server reachable at all? Used to hide hosted sharing when it is not running. */
export async function serverStatus() {
  try {
    return await request('/api/me')
  } catch {
    return null
  }
}

export const authProviders = () => request('/api/auth/providers')
export const signInUrl = (provider, returnTo = location.pathname + location.hash) =>
  `/auth/${provider}?returnTo=${encodeURIComponent(returnTo)}`
export const devSignIn = (email) => request('/auth/dev', { method: 'POST', body: JSON.stringify({ email }) })
export const signOut = () => request('/auth/logout', { method: 'POST' })

export const listShares = () => request('/api/shares')
export const createShare = (payload) => request('/api/shares', { method: 'POST', body: JSON.stringify(payload) })
export const updateShare = (slug, payload) =>
  request(`/api/shares/${slug}`, { method: 'PATCH', body: JSON.stringify(payload) })
export const deleteShare = (slug) => request(`/api/shares/${slug}`, { method: 'DELETE' })

export async function loadShare(slug) {
  try {
    return await request(`/api/shares/${slug}`)
  } catch (err) {
    return err.data && err.data.state ? err.data : { state: 'error', message: err.message }
  }
}
