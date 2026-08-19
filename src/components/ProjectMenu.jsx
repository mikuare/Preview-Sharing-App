import { useEffect, useRef, useState } from 'react'

const when = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/** The signed-in user's own workspaces: open, rename, delete, start a new one. */
export default function ProjectMenu({ projects, currentId, saving, onOpen, onCreate, onRename, onDelete, onClose }) {
  const panelRef = useRef(null)
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const onDown = (e) => panelRef.current && !panelRef.current.contains(e.target) && onClose()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="popover align-left" ref={panelRef} style={{ width: 340 }}>
      <div className="popover-head">
        Your projects
        <span style={{ flex: 1 }} />
        <span className="share-meta">{saving ? 'saving…' : 'saved'}</span>
      </div>

      <div className="share-row" style={{ paddingTop: 10 }}>
        <button className="btn tiny primary" onClick={onCreate}>
          New project
        </button>
      </div>

      <div className="share-row" style={{ paddingTop: 4 }}>
        {projects.length === 0 && <p style={{ margin: 0 }}>Nothing saved yet.</p>}

        {projects.map((project) => (
          <div className={`share-item${project.id === currentId ? ' current' : ''}`} key={project.id}>
            {renaming === project.id ? (
              <input
                className="field"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  onRename(project.id, draft.trim() || project.name)
                  setRenaming(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(project.id, draft.trim() || project.name)
                    setRenaming(null)
                  }
                }}
              />
            ) : (
              <>
                <button className="share-item-main" onClick={() => onOpen(project.id)}>
                  <span className="share-item-title">{project.name}</span>
                  <span className="share-meta">
                    {project.fileCount} file{project.fileCount === 1 ? '' : 's'} · {when(project.updatedAt)}
                  </span>
                </button>
                <button
                  className="btn tiny ghost"
                  title="Rename"
                  onClick={() => {
                    setRenaming(project.id)
                    setDraft(project.name)
                  }}
                >
                  ✎
                </button>
                <button className="btn tiny ghost danger" title="Delete" onClick={() => onDelete(project.id)}>
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
