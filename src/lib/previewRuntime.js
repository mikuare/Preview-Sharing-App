/* Runs inside the preview iframe. Loaded as raw text and injected as a module,
   so it must be plain browser JS. It wires the compiled modules together via
   blob URLs, mounts the entry component, and reports console output and errors
   back to the host app. */

function send(message) {
  try {
    parent.postMessage(Object.assign({ __dp: true }, message), '*')
  } catch (_) {}
}

// Registered first so nothing later in this file can fail silently.
window.addEventListener('error', function (event) {
  report('Runtime error', event.error || event.message)
})
window.addEventListener('unhandledrejection', function (event) {
  report('Unhandled promise rejection', event.reason)
})

send({ type: 'boot' })

const started = performance.now()
let payload
try {
  payload = JSON.parse(document.getElementById('__dp_payload__').textContent)
} catch (err) {
  report('Preview payload could not be read', err)
  throw err
}

// --- console bridge ---------------------------------------------------------

function preview(value, depth) {
  if (depth > 2) return '…'
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  const type = typeof value
  if (type === 'string') return depth === 0 ? value : JSON.stringify(value)
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value)
  if (type === 'function') return '[Function ' + (value.name || 'anonymous') + ']'
  if (type === 'symbol') return value.toString()
  if (value instanceof Error) return value.stack || value.message
  if (value instanceof Element) return '<' + value.tagName.toLowerCase() + '>'
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map(function (v) { return preview(v, depth + 1) })
    if (value.length > 20) items.push('… ' + (value.length - 20) + ' more')
    return '[' + items.join(', ') + ']'
  }
  try {
    const keys = Object.keys(value).slice(0, 20)
    return '{ ' + keys.map(function (k) { return k + ': ' + preview(value[k], depth + 1) }).join(', ') + ' }'
  } catch (_) {
    return String(value)
  }
}

const levels = ['log', 'info', 'warn', 'error', 'debug']
levels.forEach(function (level) {
  const original = console[level].bind(console)
  console[level] = function () {
    const args = Array.prototype.slice.call(arguments)
    send({ type: 'console', level, text: args.map(function (a) { return preview(a, 0) }).join(' ') })
    original.apply(console, args)
  }
})

// --- error surface ----------------------------------------------------------

function showOverlay(title, detail) {
  let el = document.getElementById('__dp_overlay__')
  if (!el) {
    el = document.createElement('div')
    el.id = '__dp_overlay__'
    document.body.appendChild(el)
  }
  el.setAttribute('style', [
    'position:fixed', 'inset:0', 'z-index:2147483647', 'padding:28px',
    'background:rgba(10,12,18,.94)', 'color:#fca5a5', 'overflow:auto',
    'font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace',
    '-webkit-font-smoothing:antialiased',
  ].join(';'))
  el.innerHTML = ''
  const h = document.createElement('div')
  h.textContent = title
  h.setAttribute('style', 'color:#f87171;font-weight:700;font-size:14px;margin-bottom:10px')
  const pre = document.createElement('pre')
  pre.textContent = detail
  pre.setAttribute('style', 'white-space:pre-wrap;margin:0;color:#fecaca')
  el.appendChild(h)
  el.appendChild(pre)
}

function report(title, error) {
  const detail = error && error.stack ? error.stack : String(error)
  send({ type: 'error', title, detail })
  showOverlay(title, detail)
}

// Common Node-isms that single-file components lean on.
window.process = window.process || { env: { NODE_ENV: 'development' }, platform: 'browser', version: '' }
window.global = window.global || window

// The preview is sandboxed without a real origin, so touching localStorage or
// sessionStorage throws a SecurityError. Components that remember a theme, a signed-in
// role or a draft would crash on load; an in-memory stand-in keeps their flow working
// for as long as this preview runs.
;['localStorage', 'sessionStorage'].forEach(function (area) {
  try {
    window[area].setItem('__dp_probe__', '1')
    window[area].removeItem('__dp_probe__')
    return // real storage works (e.g. opened from a file) — leave it alone
  } catch (_) {
    /* blocked: fall through to the stand-in */
  }
  const data = new Map()
  const store = {
    getItem: function (key) { key = String(key); return data.has(key) ? data.get(key) : null },
    setItem: function (key, value) { data.set(String(key), String(value)) },
    removeItem: function (key) { data.delete(String(key)) },
    clear: function () { data.clear() },
    key: function (index) { const keys = Array.from(data.keys()); return index in keys ? keys[index] : null },
    get length() { return data.size },
  }
  try {
    Object.defineProperty(window, area, { value: store, configurable: true })
  } catch (_) {
    /* leave the original in place */
  }
})

// --- module graph -----------------------------------------------------------

const urlByToken = new Map()

for (const path of payload.order) {
  const mod = payload.modules.find(function (m) { return m.path === path })
  if (!mod) continue
  let code = mod.code
  urlByToken.forEach(function (url, token) {
    code = code.split(token).join(url)
  })
  code += '\n//# sourceURL=' + path
  urlByToken.set(mod.token, URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
}

function pickComponent(namespace, entry) {
  if (entry.namedExport && namespace[entry.namedExport]) return namespace[entry.namedExport]
  if (namespace.default) return namespace.default
  const named = Object.keys(namespace).filter(function (key) {
    return /^[A-Z]/.test(key) && typeof namespace[key] === 'function'
  })
  return named.length ? namespace[named[0]] : null
}

function boundary(React, Component) {
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { error: null }
    }
    static getDerivedStateFromError(error) {
      return { error }
    }
    componentDidCatch(error, info) {
      report('Component crashed while rendering', {
        stack: (error && error.stack ? error.stack : String(error)) +
          (info && info.componentStack ? '\n\nComponent stack:' + info.componentStack : ''),
      })
    }
    render() {
      if (this.state.error) return null
      return React.createElement(Component)
    }
  }
  return ErrorBoundary
}

async function boot() {
  const entry = payload.entry
  if (!entry) throw new Error('No script file to preview. Upload a .jsx, .tsx, .js or .ts file.')

  const namespace = await import(urlByToken.get(entry.token))
  if (entry.selfMounting) return

  const Component = pickComponent(namespace, entry)
  if (typeof Component !== 'function') {
    throw new Error(
      'Nothing to render from ' + entry.path + '.\n\n' +
      'Export the component as `export default function App() { … }`, ' +
      'or mount it yourself with createRoot(document.getElementById("root")).'
    )
  }

  const React = await import('react')
  const client = await import('react-dom/client')
  const root = document.getElementById('root') || document.body.appendChild(document.createElement('div'))
  client.createRoot(root).render(React.createElement(boundary(React, Component)))
}

boot().then(
  function () {
    send({ type: 'ready', ms: Math.round(performance.now() - started) })
  },
  function (error) {
    report('Failed to start the preview', error)
  }
)
