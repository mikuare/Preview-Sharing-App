// Assembles the standalone HTML document that the preview iframe runs:
// import map, Tailwind runtime, user stylesheets, compiled modules, loader.

import runtimeSource from './previewRuntime.js?raw'
import { importMapEntries, reactImportMap, tailwindScriptUrl, SPECIAL } from './registry.js'

const escapeForScript = (text) => text.replace(/</g, '\\u003c')

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
  }
  #root { min-height: 100vh; }
`

/** Import map covering React plus every installed package. */
export function buildImportMap(installed, reactVersion) {
  const imports = reactImportMap(reactVersion)
  for (const pkg of installed) {
    if (SPECIAL[pkg.name]) continue // runtime-injected, not imported
    Object.assign(imports, importMapEntries(pkg))
  }
  return { imports }
}

function tailwindConfigScript(files) {
  const config = files.find((f) => /^(?:.*\/)?tailwind\.config\.[cm]?[jt]s$/i.test(f.name))
  if (!config) return ''
  const body = config.content
    .replace(/^\s*(?:import|const|let|var|require)[^\n]*$/gm, '')
    .replace(/module\.exports\s*=\s*/, '')
    .replace(/export\s+default\s*/, '')
    .replace(/;\s*$/, '')
    .trim()
  if (!body.startsWith('{')) return ''
  return `<script>try { tailwind.config = ${body} } catch (e) { console.warn('tailwind.config could not be applied:', e.message) }</script>`
}

/**
 * @param {object} options
 * @param {object} options.bundle    result of buildBundle()
 * @param {Array}  options.installed installed packages ({ name, version })
 * @param {Array}  options.files     original uploaded files (for tailwind.config)
 * @param {string} options.reactVersion
 */
export function buildPreviewHtml({ bundle, installed, files, reactVersion }) {
  const tailwind = installed.find((p) => p.name === 'tailwindcss')
  const importMap = buildImportMap(installed, reactVersion)

  const payload = {
    modules: bundle.modules,
    order: bundle.order,
    entry: bundle.entry,
  }

  const styleTags = bundle.styles
    .map((s) => `<style data-source="${s.name.replace(/"/g, '&quot;')}">\n${s.css}\n</style>`)
    .join('\n')

  const tailwindTags = tailwind
    ? `<script src="${tailwindScriptUrl(tailwind.version)}"></script>\n${tailwindConfigScript(files)}`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Preview</title>
<style>${BASE_CSS}</style>
${tailwindTags}
${styleTags}
<script type="importmap">${escapeForScript(JSON.stringify(importMap, null, 2))}</script>
<script type="application/json" id="__dp_payload__">${escapeForScript(JSON.stringify(payload))}</script>
</head>
<body>
<div id="root"></div>
<script type="module">${escapeForScript(runtimeSource)}</script>
</body>
</html>`
}
