import { useState } from 'react'
import NoteCard from './NoteCard.jsx'
import { formatStamp } from './utils.js'
import './notes.css'

const SEED = [
  { id: 1, title: 'Kickoff notes', body: 'Agreed on the preview flow: upload, inspect imports, install, render.', at: Date.now() - 8.64e7 },
  { id: 2, title: 'Follow-ups', body: 'Check bundle size once xlsx is pulled in.', at: Date.now() - 3.6e6 },
]

export default function App() {
  const [notes, setNotes] = useState(SEED)
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft.trim()) return
    setNotes([{ id: Date.now(), title: draft.trim(), body: 'New note', at: Date.now() }, ...notes])
    setDraft('')
  }

  return (
    <main className="notes">
      <h1>Notes</h1>
      <p className="sub">{notes.length} saved · last touched {formatStamp(notes[0].at)}</p>

      <div className="composer">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Note title" />
        <button onClick={add}>Add</button>
      </div>

      <div className="list">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onRemove={() => setNotes(notes.filter((n) => n.id !== note.id))} />
        ))}
      </div>
    </main>
  )
}
