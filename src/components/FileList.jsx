const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

export default function FileList({ files, activeFile, entryName, onSelect, onSetEntry, onRemove }) {
  if (!files.length) {
    return <div className="empty">No files yet. Drop a component file above to preview it.</div>
  }
  return (
    <div>
      {files.map((file) => (
        <div
          key={file.name}
          className={`file${file.name === activeFile ? ' active' : ''}${file.name === entryName ? ' entry' : ''}`}
          onClick={() => onSelect(file.name)}
        >
          <span className="entry-dot" title={file.name === entryName ? 'Preview entry point' : undefined} />
          <span className="name" title={file.name}>{file.name}</span>
          <span className="meta">{kb(file.size ?? file.content.length)}</span>
          {file.name !== entryName && /\.(jsx?|tsx?|mjs|cjs)$/i.test(file.name) && (
            <button
              className="btn tiny ghost"
              title="Preview this file"
              onClick={(e) => {
                e.stopPropagation()
                onSetEntry(file.name)
              }}
            >
              entry
            </button>
          )}
          <button
            className="btn tiny ghost danger"
            title="Remove file"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(file.name)
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
