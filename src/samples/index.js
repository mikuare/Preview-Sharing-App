import dashboard from './dashboard.jsx?raw'
import notesApp from './notes/App.jsx?raw'
import notesCard from './notes/NoteCard.jsx?raw'
import notesUtils from './notes/utils.js?raw'
import notesCss from './notes/notes.css?raw'

const file = (name, content) => ({ name, content, size: content.length })

export const SAMPLES = [
  {
    id: 'dashboard',
    label: 'Tailwind dashboard',
    hint: 'Single file — Tailwind, icons, Excel export',
    files: [file('react.jsx', dashboard)],
    entry: 'react.jsx',
  },
  {
    id: 'notes',
    label: 'Multi-file notes app',
    hint: 'Four files — relative imports and plain CSS',
    files: [
      file('App.jsx', notesApp),
      file('NoteCard.jsx', notesCard),
      file('utils.js', notesUtils),
      file('notes.css', notesCss),
    ],
    entry: 'App.jsx',
  },
]
