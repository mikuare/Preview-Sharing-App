export default function CodeEditor({ file, onChange, onClose }) {
  return (
    <div className="editor">
      <div className="editor-bar">
        <span className="name">{file ? file.name : 'no file selected'}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn tiny ghost" onClick={onClose}>Close</button>
      </div>
      <textarea
        spellCheck={false}
        value={file ? file.content : ''}
        disabled={!file}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Select a file to edit"
      />
    </div>
  )
}
