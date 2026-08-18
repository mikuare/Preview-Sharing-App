// Talks to the npm registry for version/metadata and builds the esm.sh URLs
// that the preview's import map points at. Nothing is written to disk: an
// "install" here means pinning a version and wiring it into the import map.

const REGISTRY = 'https://registry.npmjs.org'
const CDN = 'https://esm.sh'

export const DEFAULT_REACT_VERSION = '18.3.1'
export const REACT_VERSIONS = ['18.3.1', '19.1.0']

/** Packages the preview provides as a runtime service instead of an import. */
export const SPECIAL = {
  tailwindcss: {
    kind: 'runtime',
    label: 'Tailwind CSS',
    blurb: 'Injected as the Tailwind browser compiler so utility classes render.',
    versions: ['3.4.16', '4'],
    defaultVersion: '3.4.16',
  },
}

export const CATALOG = [
  { name: 'tailwindcss', blurb: 'Utility-first CSS framework' },
  { name: 'lucide-react', blurb: 'Icon set for React' },
  { name: 'framer-motion', blurb: 'Animation library' },
  { name: 'recharts', blurb: 'Charts built on D3' },
  { name: 'xlsx', blurb: 'Read & write Excel files' },
  { name: 'papaparse', blurb: 'CSV parser' },
  { name: 'date-fns', blurb: 'Date utilities' },
  { name: 'clsx', blurb: 'Class name builder' },
  { name: 'zustand', blurb: 'State management' },
  { name: 'react-hook-form', blurb: 'Form state & validation' },
  { name: 'zod', blurb: 'Schema validation' },
  { name: 'chart.js', blurb: 'Canvas charting' },
  { name: 'three', blurb: '3D rendering' },
  { name: 'axios', blurb: 'HTTP client' },
  { name: 'lodash-es', blurb: 'Utility helpers' },
]

const metaCache = new Map()

/** Resolve a dist-tag or range to a concrete version plus package metadata. */
export async function resolvePackage(name, version = 'latest') {
  const key = `${name}@${version}`
  if (metaCache.has(key)) return metaCache.get(key)
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}/${version}`)
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Package "${name}@${version}" not found on npm`
        : `npm registry responded ${res.status}`
    )
  }
  const json = await res.json()
  const meta = {
    name: json.name,
    version: json.version,
    description: json.description || '',
    homepage: json.homepage || `https://www.npmjs.com/package/${json.name}`,
    hasTypes: Boolean(json.types || json.typings),
  }
  metaCache.set(key, meta)
  return meta
}

/** Every published version, newest first. */
export async function listVersions(name) {
  const res = await fetch(`${REGISTRY}/${encodeURIComponent(name).replace('%40', '@')}`)
  if (!res.ok) throw new Error(`Could not load versions for ${name}`)
  const json = await res.json()
  return Object.keys(json.versions || {}).reverse()
}

export async function searchPackages(query, limit = 8) {
  const res = await fetch(`${REGISTRY}/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`)
  if (!res.ok) return []
  const json = await res.json()
  return (json.objects || []).map((o) => ({
    name: o.package.name,
    version: o.package.version,
    blurb: o.package.description || '',
  }))
}

/**
 * Import-map entries for one installed package. `&flag/` is esm.sh's syntax for
 * build flags on a trailing-slash (sub-path) mapping.
 */
export function importMapEntries(pkg) {
  const external = 'external=react,react-dom'
  const base = `${CDN}/${pkg.name}@${pkg.version}`
  return {
    [pkg.name]: `${base}?${external}`,
    [`${pkg.name}/`]: `${base}&${external}/`,
  }
}

/** The React runtime the preview and every installed package share. */
export function reactImportMap(reactVersion) {
  const r = `${CDN}/react@${reactVersion}`
  const rd = `${CDN}/react-dom@${reactVersion}`
  return {
    react: r,
    'react/': `${r}/`,
    'react/jsx-runtime': `${r}/jsx-runtime`,
    'react/jsx-dev-runtime': `${r}/jsx-dev-runtime`,
    'react-dom': `${rd}?external=react`,
    'react-dom/': `${rd}&external=react/`,
    'react-dom/client': `${rd}/client?external=react`,
  }
}

/**
 * Tailwind runs in the preview as a browser compiler, not as an import:
 * v3 uses the Play CDN, v4 the @tailwindcss/browser build.
 */
export function tailwindScriptUrl(version) {
  return String(version).startsWith('4')
    ? `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@${version}`
    : `https://cdn.tailwindcss.com/${version}`
}
