import { useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG, SPECIAL, searchPackages } from '../lib/registry.js'

function DependencyRow({ dep, pkg, busy, error, onInstall, onUninstall, onVersion }) {
  const [draft, setDraft] = useState(pkg?.version || '')
  useEffect(() => setDraft(pkg?.version || ''), [pkg?.version])

  const special = SPECIAL[dep.name]
  const blurb = pkg?.description || special?.blurb || dep.blurb || ''

  return (
    <div className="dep">
      <div className="dep-top">
        <span className="dep-name">{special?.label || dep.name}</span>
        {pkg && <span className="dep-version">@{pkg.version}</span>}
        <span style={{ flex: 1 }} />
        {busy ? (
          <span className="spin" />
        ) : error ? (
          <span className="badge err">failed</span>
        ) : pkg ? (
          <span className="badge ok">installed</span>
        ) : (
          <span className="badge pending">not installed</span>
        )}
      </div>

      {blurb && <div className="dep-blurb">{blurb}</div>}
      {dep.usedBy?.length > 0 && (
        <div className="dep-blurb" style={{ opacity: 0.75 }}>
          imported by {dep.usedBy.join(', ')}
        </div>
      )}
      {error && <div className="dep-blurb" style={{ color: 'var(--bad)' }}>{error}</div>}

      <div className="dep-actions">
        {pkg ? (
          <>
            {special ? (
              <select
                className="field"
                value={pkg.version}
                onChange={(e) => onVersion(dep.name, e.target.value)}
              >
                {special.versions.map((v) => (
                  <option key={v} value={v}>v{v}</option>
                ))}
              </select>
            ) : (
              <input
                className="field"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onVersion(dep.name, draft.trim())}
                onBlur={() => draft.trim() && draft.trim() !== pkg.version && onVersion(dep.name, draft.trim())}
                title="Pin a version, then press Enter"
              />
            )}
            <button className="btn tiny danger" onClick={() => onUninstall(dep.name)}>Remove</button>
          </>
        ) : (
          <button className="btn tiny primary" disabled={busy} onClick={() => onInstall(dep.name)}>
            Install
          </button>
        )}
      </div>
    </div>
  )
}

export default function DependencyPanel({
  detected,
  installed,
  tailwind,
  busy,
  errors,
  onInstall,
  onUninstall,
  onVersion,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const timer = useRef(null)

  const installedMap = useMemo(() => new Map(installed.map((p) => [p.name, p])), [installed])

  // Detected imports first, then anything installed by hand.
  const rows = useMemo(() => {
    const seen = new Set(detected.map((d) => d.name))
    const extra = installed.filter((p) => !seen.has(p.name)).map((p) => ({ name: p.name, usedBy: [] }))
    return [...detected, ...extra]
  }, [detected, installed])

  const tailwindMissing = tailwind.likely && !installedMap.has('tailwindcss')
  // Tailwind is never an import, so fold the detected-by-markup case in here.
  const missing = [
    ...(tailwindMissing ? [{ name: 'tailwindcss' }] : []),
    ...rows.filter((r) => !installedMap.has(r.name) && r.name !== 'tailwindcss'),
  ]

  useEffect(() => {
    clearTimeout(timer.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      try {
        setResults(await searchPackages(query.trim()))
      } catch {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query])

  return (
    <>
      <div className="section-head">
        Dependencies
        <span className="count">{installed.length} installed</span>
        <span style={{ flex: 1 }} />
        {missing.length > 0 && (
          <button className="btn tiny primary" onClick={() => missing.forEach((m) => onInstall(m.name))}>
            Install all ({missing.length})
          </button>
        )}
      </div>

      <div className="section-body">
        {tailwindMissing && (
          <div className="callout">
            <div className="title">This design uses Tailwind CSS</div>
            <p>{tailwind.reason}. Install Tailwind so the preview renders with the styling it was designed for.</p>
            <button className="btn tiny primary" onClick={() => onInstall('tailwindcss')}>
              Install Tailwind CSS
            </button>
          </div>
        )}

        {rows.length === 0 && !tailwindMissing && (
          <div className="empty">
            No package imports found. Anything your file imports from npm shows up here, ready to install.
          </div>
        )}

        {rows.map((dep) => (
          <DependencyRow
            key={dep.name}
            dep={dep}
            pkg={installedMap.get(dep.name)}
            busy={busy.includes(dep.name)}
            error={errors[dep.name]}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onVersion={onVersion}
          />
        ))}

        <div style={{ marginTop: 12 }}>
          <input
            className="field"
            placeholder="Add a package (e.g. xlsx)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                onInstall(query.trim())
                setQuery('')
              }
            }}
          />
          {results.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {results.map((r) => (
                <div className="file" key={r.name} onClick={() => { onInstall(r.name); setQuery('') }}>
                  <span className="name" title={r.blurb}>{r.name}</span>
                  <span className="meta">{r.version}</span>
                </div>
              ))}
            </div>
          )}
          {!query && (
            <div className="chiprow" style={{ marginTop: 10 }}>
              {CATALOG.filter((c) => !installedMap.has(c.name))
                .slice(0, 8)
                .map((c) => (
                  <button key={c.name} className="chip" title={c.blurb} onClick={() => onInstall(c.name)}>
                    + {c.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
