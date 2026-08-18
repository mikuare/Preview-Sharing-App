// Sharing without a server: a workspace is gzipped into the URL hash, and a
// preview can be written out as one self-contained HTML file.

const toBase64Url = (bytes) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

const canCompress = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

/** Pack a workspace into a URL-safe token (gzip + base64url). */
export async function encodeWorkspace(workspace) {
  const json = JSON.stringify(workspace)
  if (!canCompress) return 'r' + toBase64Url(new TextEncoder().encode(json))
  return 'z' + toBase64Url(await gzip(json))
}

export async function decodeWorkspace(token) {
  const body = token.slice(1)
  if (token[0] === 'z') return JSON.parse(await gunzip(fromBase64Url(body)))
  if (token[0] === 'r') return JSON.parse(new TextDecoder().decode(fromBase64Url(body)))
  throw new Error('Unrecognised share link')
}

export function shareUrl(token) {
  return `${location.origin}${location.pathname}#project=${token}`
}

/** Read a workspace out of the current URL, if there is one. */
export async function workspaceFromLocation() {
  const match = location.hash.match(/#project=([\w-]+)/)
  if (!match) return null
  try {
    return await decodeWorkspace(match[1])
  } catch (err) {
    console.warn('Share link could not be read:', err.message)
    return null
  }
}

export function download(filename, content, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}
