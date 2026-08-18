import { formatStamp } from './utils.js'

export default function NoteCard({ note, onRemove }) {
  return (
    <article className="card">
      <header>
        <h2>{note.title}</h2>
        <button onClick={onRemove} aria-label="Remove note">×</button>
      </header>
      <p>{note.body}</p>
      <time>{formatStamp(note.at)}</time>
    </article>
  )
}
