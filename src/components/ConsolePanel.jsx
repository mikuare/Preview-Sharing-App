import { useEffect, useRef } from 'react'

export default function ConsolePanel({ messages, open, onToggle, onClear }) {
  const bodyRef = useRef(null)

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages, open])

  const errors = messages.filter((m) => m.level === 'error').length

  return (
    <div className="console">
      <div className="console-bar">
        <span className="title">Console</span>
        {messages.length > 0 && <span className="chip">{messages.length}</span>}
        {errors > 0 && <span className="badge err">{errors} error{errors > 1 ? 's' : ''}</span>}
        <span className="spacer" />
        <button className="btn tiny ghost" onClick={onClear}>Clear</button>
        <button className="btn tiny ghost" onClick={onToggle}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="console-body" ref={bodyRef}>
          {messages.length === 0 ? (
            <div className="empty" style={{ paddingLeft: 12 }}>Nothing logged yet.</div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`console-row ${m.level}`}>
                <span className="lvl">{m.level}</span>
                <span className="txt">{m.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
