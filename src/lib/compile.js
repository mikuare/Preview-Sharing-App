// Turns the uploaded files into browser-ready ES modules with Babel, resolving
// imports between them and pulling out anything that is really an asset (CSS,
// images) rather than code.

import { extractSpecifiers, isRelative, isScript, isStyle, mountsItself, namedComponentExport } from './detect.js'

// Babel is ~3 MB, so it is fetched on demand the first time a preview is built.
let Babel = null

export async function ensureCompiler() {
  if (!Babel) Babel = await import('@babel/standalone')
  return Babel
}

export const compilerReady = () => Babel !== null

const SCRIPT_EXTS = ['', '.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs']
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav)$/i
const STYLE_RE = /\.(css|scss|sass|less)$/i

const TRANSPARENT_PNG =
  'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%23334155%22/%3E%3C/svg%3E'

const normalize = (p) => {
  const out = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}
const dirname = (p) => p.split('/').slice(0, -1).join('/')

/**
 * Map a relative specifier onto one of the uploaded files. Uploads are often
 * flattened (a single `react.jsx` next to a `Button.jsx`), so if the literal
 * path misses we fall back to matching on file name alone.
 */
export function resolveRelative(importer, spec, files) {
  const byPath = new Map(files.map((f) => [f.name, f]))
  const joined = normalize(`${dirname(importer)}/${spec}`)
  for (const ext of SCRIPT_EXTS) {
    const hit = byPath.get(joined + ext) || byPath.get(`${joined}/index${ext}`)
    if (hit) return hit.name
  }
  if (STYLE_RE.test(spec) || ASSET_RE.test(spec)) {
    const exact = byPath.get(joined)
    if (exact) return exact.name
  }
  const wanted = spec.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase()
  const loose = files.find((f) => {
    const base = f.name.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase()
    return base === wanted
  })
  return loose ? loose.name : null
}

export function transformSource(file) {
  if (!Babel) throw new Error('Compiler is still loading — try again in a moment.')
  const isTs = /\.tsx?$/i.test(file.name)
  const presets = [['react', { runtime: 'automatic' }]]
  if (isTs) presets.push(['typescript', { isTSX: true, allExtensions: true }])
  const { code } = Babel.transform(file.content, {
    filename: file.name,
    presets,
    plugins: [],
    sourceType: 'module',
    compact: false,
    retainLines: false,
  })
  return code
}

/**
 * Compile every script file and produce the module graph the preview runtime
 * boots from.
 *
 * Returns { modules, styles, entry, order, errors }.
 * Each module's relative imports are replaced with `__DP_MODULE_n__` tokens
 * that the runtime swaps for blob URLs once the dependency's blob exists.
 */
export function buildBundle(files, entryName) {
  const errors = []
  const styles = []
  const scripts = files.filter((f) => isScript(f.name))
  const paths = scripts.map((f) => f.name)
  const tokenOf = new Map(paths.map((p, i) => [p, `__DP_MODULE_${i}__`]))

  for (const file of files) {
    if (isStyle(file.name)) styles.push({ name: file.name, css: file.content })
  }

  const modules = []
  const edges = new Map()

  for (const file of scripts) {
    let code
    try {
      code = transformSource(file)
    } catch (err) {
      errors.push(formatBabelError(err, file.name))
      continue
    }

    const deps = []
    for (const spec of extractSpecifiers(file.content)) {
      if (!isRelative(spec)) continue
      const target = resolveRelative(file.name, spec, files)

      if (target && isScript(target)) {
        deps.push(target)
        code = replaceSpecifier(code, spec, tokenOf.get(target))
      } else if (STYLE_RE.test(spec)) {
        // `import './styles.css'` — the stylesheet is injected into the document
        // instead, so the import is dropped from the module.
        code = dropSideEffectImport(code, spec)
      } else if (ASSET_RE.test(spec)) {
        code = replaceSpecifier(code, spec, TRANSPARENT_PNG)
      } else {
        errors.push({
          file: file.name,
          message: `Cannot resolve "${spec}" — that file was not uploaded.`,
          kind: 'resolve',
        })
      }
    }

    edges.set(file.name, deps)
    modules.push({ path: file.name, token: tokenOf.get(file.name), code })
  }

  const entryFile = scripts.find((f) => f.name === entryName) || scripts[0]
  const { order, cycle } = topoSort(modules.map((m) => m.path), edges)
  if (cycle) {
    errors.push({
      file: cycle[0],
      kind: 'cycle',
      message: `Circular import: ${cycle.join(' → ')}. The preview loads modules in dependency order and cannot resolve a cycle.`,
    })
  }

  return {
    modules,
    styles,
    order,
    errors,
    entry: entryFile
      ? {
          path: entryFile.name,
          token: tokenOf.get(entryFile.name),
          selfMounting: mountsItself(entryFile.content),
          hasDefault: /export\s+default/.test(entryFile.content),
          namedExport: namedComponentExport(entryFile.content),
        }
      : null,
  }
}

function quoted(spec) {
  const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(['"])${esc}\\1`, 'g')
}

function replaceSpecifier(code, spec, replacement) {
  return code.replace(quoted(spec), JSON.stringify(replacement))
}

function dropSideEffectImport(code, spec) {
  const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return code
    .replace(new RegExp(`^\\s*import\\s+(['"])${esc}\\1\\s*;?\\s*$`, 'gm'), '')
    .replace(new RegExp(`^\\s*import\\s+[^'"\\n]*?from\\s*(['"])${esc}\\1\\s*;?\\s*$`, 'gm'), '')
}

/** Dependencies first, so a module's blob URL exists before anything imports it. */
function topoSort(nodes, edges) {
  const state = new Map()
  const order = []
  let cycle = null

  const visit = (node, stack) => {
    if (state.get(node) === 'done') return
    if (state.get(node) === 'active') {
      cycle = [...stack.slice(stack.indexOf(node)), node]
      return
    }
    state.set(node, 'active')
    for (const dep of edges.get(node) || []) {
      if (nodes.includes(dep)) visit(dep, [...stack, node])
    }
    state.set(node, 'done')
    order.push(node)
  }

  for (const node of nodes) visit(node, [])
  return { order, cycle }
}

export function formatBabelError(err, fileName) {
  const loc = err.loc || (err.location && err.location.start)
  return {
    file: fileName,
    kind: 'syntax',
    line: loc ? loc.line : undefined,
    column: loc ? loc.column : undefined,
    message: String(err.message || err).replace(/^unknown(?: file)?:\s*/i, ''),
    frame: err.codeFrame || (err.message && err.message.includes('\n') ? err.message : ''),
  }
}
