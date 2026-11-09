import { useEffect, useRef, useState } from 'react'
import HostedShare from './HostedShare.jsx'
import { copyText, download, encodeWorkspace, shareUrl } from '../lib/share.js'
import { standalonePage } from '../lib/buildPreview.js'

const kb = (n) => `${Math.round(n / 1024)} KB`

export default function SharePanel({ workspace, previewHtml, entryName, projectId, onClose }) {
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    let alive = true
    encodeWorkspace(workspace).then((token) => {
      if (alive) setLink(shareUrl(token))
    })
    return () => {
      alive = false
    }
  }, [workspace])

  useEffect(() => {
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const base = (entryName || 'preview').split('/').pop().replace(/\.[^.]+$/, '')
  const tooLong = link.length > 8000
  // A pinned light/dark theme travels in a wrapper frame (a page cannot force its own
  // prefers-color-scheme). With Auto the file is the plain preview, as before.
  const theme = workspace.previewTheme || 'system'
  const fileHtml = () =>
    theme === 'system' ? previewHtml : standalonePage(previewHtml, { title: `${base} preview`, theme })

  return (
    <div className="popover" ref={panelRef}>
      <div className="popover-head">Share this preview</div>

      <div className="share-row">
        <div className="share-title">Standalone HTML file</div>
        <p>
          One self-contained page — the built preview, its import map and styles. Whoever you send it
          to just opens the file; nothing to install. {previewHtml ? `About ${kb(previewHtml.length)}.` : ''}
        </p>
        <button
          className="btn tiny primary"
          disabled={!previewHtml}
          onClick={() => {
            download(`${base}-preview.html`, fileHtml())
            setNote('Downloaded — send that file to anyone.')
          }}
        >
          Download {base}-preview.html
        </button>
      </div>

      <div className="share-row">
        <div className="share-title">Workspace link</div>
        <p>
          The whole workspace — files, entry point and installed packages — packed into the URL. Opens
          in any running copy of Development Preview, editable on the other end.
        </p>
        <input className="field" readOnly value={link} onFocus={(e) => e.target.select()} />
        <div className="share-actions">
          <button
            className="btn tiny"
            disabled={!link}
            onClick={async () => setNote((await copyText(link)) ? 'Link copied.' : 'Could not copy — select the text instead.')}
          >
            Copy link
          </button>
          <span className="share-meta">{link ? `${link.length.toLocaleString()} characters` : 'packing…'}</span>
        </div>
        {tooLong && (
          <p className="share-warn">
            This link is long enough that some chat apps and mail clients will truncate it — send the
            HTML file instead, or share the folder.
          </p>
        )}
      </div>

      <HostedShare workspace={workspace} previewHtml={previewHtml} projectId={projectId} defaultTitle={`${base} preview`} />

      {note && <div className="share-note">{note}</div>}
    </div>
  )
}
