import { useEffect, useRef, useState } from 'react'

const WIDTHS = [
  { id: 'full', label: 'Full', px: null },
  { id: 'tablet', label: 'Tablet', px: 834 },
  { id: 'phone', label: 'Phone', px: 390 },
]

const SANDBOX = 'allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads'

export default function PreviewPane({
  html,
  runKey,
  status,
  compileErrors,
  device,
  onDevice,
  autoRun,
  onToggleAuto,
  onRun,
  hasFiles,
  missingDeps = [],
  onInstallMissing,
  tailwindHint,
}) {
  const frameRef = useRef(null)
  const blobRef = useRef(null)
  const [notice, setNotice] = useState('')

  useEffect(() => () => blobRef.current && URL.revokeObjectURL(blobRef.current), [])

  // Opens the built preview as its own page. The blob URL has to outlive the
  // click long enough for the new tab to load it.
  const openStandalone = () => {
    if (!html) return
    if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    blobRef.current = url
    const tab = window.open(url, '_blank')
    if (!tab || tab.closed) {
      setNotice('Your browser blocked that tab — allow pop-ups for this site, then try Open again.')
      setTimeout(() => setNotice(''), 8000)
      return
    }
    tab.focus()
  }

  const width = WIDTHS.find((w) => w.id === device) || WIDTHS[0]

  return (
    <div className="preview-wrap">
      <div className="preview-bar">
        <button className="btn tiny" onClick={onRun} disabled={!hasFiles}>Run</button>
        <label className="status" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={autoRun} onChange={onToggleAuto} /> auto
        </label>
        <div className="segmented">
          {WIDTHS.map((w) => (
            <button key={w.id} className={w.id === device ? 'on' : ''} onClick={() => onDevice(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <span className="status">
          {status.state === 'building' && <><span className="spin" /> building…</>}
          {status.state === 'ready' && <><span className="badge ok">live</span> mounted in {status.ms}ms</>}
          {status.state === 'error' && <span className="badge err">error</span>}
          {status.state === 'blocked' && <span className="badge pending">needs packages</span>}
          {status.state === 'idle' && 'idle'}
        </span>
        <button className="btn tiny ghost" onClick={openStandalone} disabled={!html}>Open ↗</button>
      </div>

      {notice && (
        <div style={{ padding: '6px 12px', background: '#2a2011', borderBottom: '1px solid #453419', fontSize: 12, color: 'var(--warn)' }}>
          {notice}
        </div>
      )}
      {tailwindHint && html && (
        <div style={{ padding: '6px 12px', background: '#101a2b', borderBottom: '1px solid #24406b', fontSize: 12, color: 'var(--muted)' }}>
          This markup uses Tailwind utility classes — install Tailwind CSS on the left to see the intended design.
        </div>
      )}
      <div className="stage">
        {missingDeps.length > 0 ? (
          <div className="error-card" style={{ borderColor: '#3c3520', background: '#16130c' }}>
            <h3 style={{ color: 'var(--warn)' }}>
              {missingDeps.length} package{missingDeps.length > 1 ? 's' : ''} need installing before this can render
            </h3>
            <div className="where" style={{ whiteSpace: 'pre-wrap' }}>
              {missingDeps.map((d) => `${d.name} — imported by ${d.usedBy.join(', ')}`).join('\n')}
            </div>
            <button className="btn tiny primary" onClick={onInstallMissing}>
              Install {missingDeps.map((d) => d.name).join(', ')}
            </button>
          </div>
        ) : compileErrors.length > 0 ? (
          <div className="error-card">
            <h3>{compileErrors.length} problem{compileErrors.length > 1 ? 's' : ''} compiling your files</h3>
            {compileErrors.map((err, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div className="where">
                  {err.file}
                  {err.line ? `:${err.line}${err.column != null ? `:${err.column}` : ''}` : ''} — {err.kind}
                </div>
                <pre>{err.frame || err.message}</pre>
              </div>
            ))}
          </div>
        ) : !hasFiles ? (
          <div className="stage-empty">
            <h2>Nothing loaded yet</h2>
            Drop a component file on the left — say <code>react.jsx</code> — and it renders here.
            Imports it needs (Tailwind, xlsx, charts…) appear in the dependency list, ready to install.
          </div>
        ) : !html ? (
          <div className="stage-empty">
            <h2>Ready when you are</h2>
            Press <strong>Run</strong> to build the preview.
          </div>
        ) : (
          <div className="frame" style={{ maxWidth: width.px ? `${width.px}px` : '100%' }}>
            <iframe
              key={runKey}
              ref={frameRef}
              title="preview"
              sandbox={SANDBOX}
              srcDoc={html}
            />
          </div>
        )}
      </div>
    </div>
  )
}
