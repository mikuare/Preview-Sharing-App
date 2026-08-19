// Checks that the migration landed and that the configured key can use it.
//
//   node scripts/verify-supabase.mjs              read-only checks
//   node scripts/verify-supabase.mjs --roundtrip  also writes and deletes one
//                                                 throwaway share
import 'dotenv/config'

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const roundtrip = process.argv.includes('--roundtrip')

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set in .env')
  process.exit(1)
}

const keyRole = (() => {
  if (key.startsWith('sb_secret_')) return 'service_role'
  if (key.startsWith('sb_publishable_')) return 'anon'
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || 'unknown'
  } catch {
    return 'unknown'
  }
})()

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const results = []

async function check(label, path, options = {}) {
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers, ...options })
    const body = await res.text()
    const ok = res.ok
    results.push({ label, ok, detail: ok ? `${res.status}` : `${res.status} ${body.slice(0, 160)}` })
    return { ok, body }
  } catch (err) {
    results.push({ label, ok: false, detail: err.message })
    return { ok: false }
  }
}

console.log(`project   ${url}`)
console.log(`key role  ${keyRole}${keyRole === 'service_role' ? '' : '   ← must be service_role'}`)
console.log('')

await check('table preview_users', 'preview_users?select=id&limit=1')
await check('table preview_shares', 'preview_shares?select=slug&limit=1')
await check('table preview_share_invites', 'preview_share_invites?select=slug&limit=1')
await check('embedded invites join', 'preview_shares?select=slug,preview_share_invites(email)&limit=1')
await check('function preview_increment_share_views', 'rpc/preview_increment_share_views', {
  method: 'POST',
  body: JSON.stringify({ p_slug: '__verify_nonexistent__' }),
})

if (roundtrip) {
  const slug = `verify${Date.now().toString(36)}`
  const user = await check('insert throwaway user', 'preview_users?select=id', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ provider: 'verify', provider_id: slug, email: `${slug}@example.invalid` }),
  })
  const ownerId = user.ok ? JSON.parse(user.body)[0]?.id : null

  if (ownerId) {
    await check('insert share', 'preview_shares', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        owner_id: ownerId,
        title: 'verification',
        visibility: 'invite',
        workspace: { files: [{ name: 'a.jsx', content: 'x' }] },
      }),
    })
    await check('insert invite', 'preview_share_invites', {
      method: 'POST',
      body: JSON.stringify({ slug, email: 'someone@example.invalid' }),
    })
    await check('read back with invites', `preview_shares?select=*,preview_share_invites(email)&slug=eq.${slug}`)
    await check('delete invite', `preview_share_invites?slug=eq.${slug}`, { method: 'DELETE' })
    await check('delete share', `preview_shares?slug=eq.${slug}`, { method: 'DELETE' })
    await check('delete throwaway user', `preview_users?id=eq.${ownerId}`, { method: 'DELETE' })
  }
}

let failed = 0
for (const r of results) {
  if (!r.ok) failed++
  console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.label}${r.ok ? '' : `  — ${r.detail}`}`)
}

console.log('')
if (failed === 0) {
  console.log(roundtrip ? 'All checks passed, and nothing was left behind.' : 'All checks passed. Add --roundtrip to test writes.')
} else {
  console.log(`${failed} check(s) failed.`)
  console.log('If tables are "not found in the schema cache", the migration has not been applied: npm run db:push')
}
process.exit(failed === 0 ? 0 : 1)
