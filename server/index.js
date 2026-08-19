// Local / self-hosted entry point. On Vercel, api/index.js mounts the same app.

import app from './app.js'
import { config, describeConfig } from './config.js'
import { checkStore } from './store/index.js'

const storage = await checkStore()
const info = describeConfig(storage)

app.listen(config.port, () => {
  console.log(`share server  ${info.baseUrl}`)
  console.log(`app origin    ${config.appOrigin}`)
  console.log(
    `storage       ${storage.active}` +
      (config.supabase.enabled ? ` (key role: ${config.supabase.keyRole})` : '') +
      (storage.degraded
        ? storage.reason === 'rejected'
          ? ' — supabase rejected the request, local fallback'
          : ' — supabase unreachable, local fallback'
        : '')
  )
  console.log(`sign-in       ${info.providers.length ? info.providers.join(', ') : 'none configured'}`)
  for (const warning of info.warnings) console.warn(`warning       ${warning}`)
})
