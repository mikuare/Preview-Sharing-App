// Static analysis of uploaded source files: which modules they import,
// which of those are npm packages, and whether the design needs Tailwind.

const PATTERNS = [
  /import\s+[^'"();]*?\sfrom\s*['"]([^'"]+)['"]/g, // import X from 'y'
  /import\s*['"]([^'"]+)['"]/g,                    // import 'y'
  /export\s+[^'"();]*?\sfrom\s*['"]([^'"]+)['"]/g, // export * from 'y'
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,          // dynamic import('y')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,         // require('y')
]

/** Every module specifier referenced by a source file. */
export function extractSpecifiers(code) {
  const found = new Set()
  const stripped = stripComments(code)
  for (const re of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(stripped))) found.add(m[1])
  }
  return [...found]
}

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
}

export const isRelative = (spec) => spec.startsWith('.') || spec.startsWith('/')

/** 'lodash/debounce' -> 'lodash', '@scope/pkg/sub' -> '@scope/pkg' */
export function packageName(spec) {
  if (isRelative(spec)) return null
  if (spec.startsWith('http://') || spec.startsWith('https://')) return null
  if (spec.startsWith('node:') || spec.startsWith('data:')) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

// Provided by the preview runtime itself — never shown as "needs installing".
export const RUNTIME_PACKAGES = new Set(['react', 'react-dom'])

/**
 * Walk every file and return the npm packages the project depends on,
 * with the files that reference each one.
 */
export function collectDependencies(files) {
  const deps = new Map()
  for (const file of files) {
    if (!isScript(file.name)) continue
    for (const spec of extractSpecifiers(file.content)) {
      const pkg = packageName(spec)
      if (!pkg || RUNTIME_PACKAGES.has(pkg)) continue
      if (!deps.has(pkg)) deps.set(pkg, { name: pkg, specifiers: new Set(), usedBy: new Set() })
      const entry = deps.get(pkg)
      entry.specifiers.add(spec)
      entry.usedBy.add(file.name)
    }
  }
  return [...deps.values()].map((d) => ({
    name: d.name,
    specifiers: [...d.specifiers],
    usedBy: [...d.usedBy],
  }))
}

export function isScript(name) {
  return /\.(jsx?|tsx?|mjs|cjs)$/i.test(name)
}
export function isStyle(name) {
  return /\.css$/i.test(name)
}
export function isHtml(name) {
  return /\.html?$/i.test(name)
}

// --- Tailwind detection -----------------------------------------------------

// Utility prefixes that are distinctive enough to imply Tailwind rather than
// hand-written CSS class names.
const TW_UTILITY =
  /(?:^|[\s"'`])(?:(?:sm|md|lg|xl|2xl|hover|focus|active|group-hover|dark|first|last|odd|even)):?[a-z[-]|(?:^|[\s"'`])(?:bg|text|border|rounded|shadow|flex|grid|gap|space-[xy]|items|justify|self|content|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min-w|min-h|max-w|max-h|font|leading|tracking|opacity|z|top|left|right|bottom|inset|ring|divide|transition|duration|ease|animate|cursor|overflow|object|col-span|row-span|order|basis|grow|shrink|aspect|backdrop|blur|from|via|to|placeholder|outline|underline|uppercase|truncate|sr-only|container|absolute|relative|fixed|sticky|block|inline-block|inline-flex|hidden)(?:-[a-z0-9./[\]#%-]+)?(?=[\s"'`]|$)/g

const TW_KEYWORDS = /tailwind|@apply|@tailwind/i
const CLASS_ATTR = /(?:className|class)\s*=\s*(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g
// `.name` in a selector position — in a .css file or a CSS string inside a component.
const CSS_CLASS_SELECTOR = /\.(-?[A-Za-z_][\w-]*)(?=\s*[{,:.[>+~)]|\s+[.#\w[*>+~])/g

/** Class names the project styles itself, so they are not evidence of Tailwind. */
function ownClassNames(files) {
  const own = new Set()
  for (const file of files) {
    const text = file.content.replace(CLASS_ATTR, '')
    CSS_CLASS_SELECTOR.lastIndex = 0
    let m
    while ((m = CSS_CLASS_SELECTOR.exec(text))) own.add(m[1])
  }
  return own
}

/**
 * Heuristic: does this project's markup look like it was designed with Tailwind?
 * Returns { likely, hits, reason }.
 *
 * Names such as `block`, `m-row` or `w-140` look like utilities but are just as common in
 * hand-written CSS, so a class only counts when the project does not define it itself.
 */
export function detectTailwind(files) {
  let hits = 0
  let styled = 0
  let keyword = false
  const own = ownClassNames(files)
  for (const file of files) {
    if (TW_KEYWORDS.test(file.content)) keyword = true
    const classAttrs = file.content.match(CLASS_ATTR) || []
    for (const attr of classAttrs) {
      TW_UTILITY.lastIndex = 0
      for (const match of attr.match(TW_UTILITY) || []) {
        if (own.has(match.trim().replace(/^["'`]/, ''))) styled += 1
        else hits += 1
      }
    }
  }
  const likely = keyword || (hits >= 6 && hits >= styled)
  return {
    likely,
    hits,
    reason: keyword
      ? 'Source mentions Tailwind directly'
      : likely
        ? `${hits} Tailwind-style utility classes found in markup`
        : 'No Tailwind utility classes detected',
  }
}

// --- Entry point detection --------------------------------------------------

const ENTRY_PRIORITY = [/^(?:src\/)?main\.[jt]sx?$/i, /^(?:src\/)?index\.[jt]sx?$/i, /^(?:src\/)?app\.[jt]sx?$/i]

/** Which file should the preview boot from? */
export function pickEntry(files) {
  const scripts = files.filter((f) => isScript(f.name))
  if (!scripts.length) return files.find((f) => isHtml(f.name)) || null
  // A file that mounts React itself is definitively the entry.
  const mounts = scripts.filter((f) => mountsItself(f.content))
  if (mounts.length) return mounts[0]
  for (const re of ENTRY_PRIORITY) {
    const hit = scripts.find((f) => re.test(f.name))
    if (hit) return hit
  }
  // Otherwise: a file nobody else imports and that exports a component.
  const imported = new Set()
  for (const f of scripts) {
    for (const spec of extractSpecifiers(f.content)) {
      if (isRelative(spec)) imported.add(basename(spec).toLowerCase())
    }
  }
  const roots = scripts.filter((f) => !imported.has(basename(f.name).toLowerCase()))
  return roots.find(hasComponentExport) || roots[0] || scripts[0]
}

export function mountsItself(code) {
  return /createRoot\s*\(|ReactDOM\.render\s*\(|hydrateRoot\s*\(/.test(code)
}

export function hasComponentExport(file) {
  return /export\s+default/.test(file.content)
}

/** Name of a capitalised named export, used when there is no default export. */
export function namedComponentExport(code) {
  const re = /export\s+(?:const|function|class)\s+([A-Z]\w*)/g
  const m = re.exec(code)
  return m ? m[1] : null
}

export function basename(p) {
  return p.split('/').pop().replace(/\.(jsx?|tsx?|mjs|cjs)$/i, '')
}
