import crypto from 'node:crypto'

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newSlug(length = 10) {
  let slug = ''
  for (const byte of crypto.randomBytes(length)) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
  return slug
}

export const normaliseEmail = (email) => String(email || '').trim().toLowerCase()

/**
 * The one access rule, shared by both storage backends.
 * Returns 'ok' | 'signin' | 'forbidden'.
 */
export function access(share, viewer) {
  if (share.visibility === 'public') return 'ok'
  if (!viewer) return 'signin'
  if (viewer.id === share.ownerId) return 'ok'
  const email = normaliseEmail(viewer.email)
  return email && share.invites.includes(email) ? 'ok' : 'forbidden'
}
