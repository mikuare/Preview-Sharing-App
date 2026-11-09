import { useEffect, useRef, useState } from 'react'
import { fileCount, timeAgo } from '../lib/format.js'

// Past this many projects the list gets a search box.
const SEARCH_FROM = 6

/** The signed-in user's own workspaces: open, rename, delete, start a new one. */
export default function ProjectMenu({ projects, currentId, saving, onOpen, onCreate, onRename, onDelete, onClose }) {
  const panelRef = useRef(null)
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [query, setQuery] = useState('')

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

  const needle = query.trim().toLowerCase()
  const shown = needle ? projects.filter((p) => p.name.toLowerCase().includes(needle)) : projects

  const startRename = (project) => {
    setConfirming(null)
    setRenaming(project.id)
    setDraft(project.name)
  }

  // Enter and blur both land here; `renaming` makes sure it only saves once.
  const commitRename = (project) => {
    if (renaming !== project.id) return
    setRenaming(null)
    const name = draft.trim()
    if (name && name !== project.name) onRename(project.id, name)
  }

  const confirmDelete = async (project) => {
    setDeleting(project.id)
    try {
      await onDelete(project.id)
    } finally {
      setDeleting(null)
      setConfirming(null)
    }
  }

  return (
    <div className="popover align-left project-menu" ref={panelRef} style={{ width: 360 }}>
      <div className="popover-head">
        Your projects
        <span className="count">{projects.length}</span>
        <span style={{ flex: 1 }} />
        <span className="share-meta">{saving ? 'saving…' : 'saved'}</span>
      </div>

      <div className="share-row project-tools">
        <button className="btn tiny primary" onClick={onCreate}>
          New project
        </button>
        {projects.length >= SEARCH_FROM && (
          <input
            className="field"
            type="search"
            placeholder="Find a project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </div>

      <div className="share-row" style={{ paddingTop: 4 }}>
        {projects.length === 0 && <p style={{ margin: 0 }}>Nothing saved yet. Drop a file to start one.</p>}
        {projects.length > 0 && shown.length === 0 && <p style={{ margin: 0 }}>No project matches “{query.trim()}”.</p>}

        {shown.map((project) => {
          const isOpen = project.id === currentId
          if (confirming === project.id) {
            return (
              <div className="share-item confirm" key={project.id}>
                <span className="confirm-text">
                  Delete <b>{project.name}</b>? This can’t be undone. Share links made from it keep working.
                </span>
                <span className="confirm-actions">
                  <button className="btn tiny ghost" autoFocus onClick={() => setConfirming(null)} disabled={deleting === project.id}>
                    Cancel
                  </button>
                  <button
                    className="btn tiny danger-solid"
                    onClick={() => confirmDelete(project)}
                    disabled={deleting === project.id}
                  >
                    {deleting === project.id ? 'Deleting…' : 'Delete'}
                  </button>
                </span>
              </div>
            )
          }
          return (
            <div className={`share-item${isOpen ? ' current' : ''}`} key={project.id}>
              {renaming === project.id ? (
                <input
                  className="field"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(project)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(project)
                    if (e.key === 'Escape') {
                      e.stopPropagation() // cancel the rename, keep the menu open
                      setRenaming(null)
                    }
                  }}
                />
              ) : (
                <>
                  <button className="share-item-main" onClick={() => onOpen(project.id)} title={isOpen ? 'Open now' : 'Open'}>
                    <span className="share-item-title">
                      {project.name}
                      {isOpen && <span className="open-tag">open</span>}
                    </span>
                    <span className="share-meta">
                      {fileCount(project.fileCount)} · {timeAgo(project.updatedAt)}
                    </span>
                  </button>
                  <button className="btn tiny ghost" title="Rename" aria-label={`Rename ${project.name}`} onClick={() => startRename(project)}>
                    ✎
                  </button>
                  <button
                    className="btn tiny ghost danger"
                    title="Delete"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => {
                      setRenaming(null)
                      setConfirming(project.id)
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
