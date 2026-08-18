import { useCallback, useRef, useState } from 'react'

const TEXT_EXT = /\.(jsx?|tsx?|mjs|cjs|css|scss|less|html?|json|svg|txt|md)$/i
const MAX_BYTES = 2 * 1024 * 1024

async function readEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject))
    out.push({ path: prefix + file.name, file })
  } else if (entry.isDirectory) {
    if (/^(node_modules|\.git|dist|build)$/i.test(entry.name)) return
    const reader = entry.createReader()
    const entries = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])))
    for (const child of entries) await readEntry(child, `${prefix}${entry.name}/`, out)
  }
}

async function toRecords(list) {
  const records = []
  for (const { path, file } of list) {
    if (!TEXT_EXT.test(path)) continue
    if (file.size > MAX_BYTES) continue
    records.push({ name: path.replace(/^\.\//, ''), content: await file.text(), size: file.size })
  }
  return records
}

export default function Dropzone({ onFiles }) {
  const [over, setOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = useCallback(
    async (event) => {
      event.preventDefault()
      setOver(false)
      const items = [...event.dataTransfer.items]
      const collected = []
      const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean)
      if (entries.length) {
        for (const entry of entries) await readEntry(entry, '', collected)
      } else {
        for (const file of event.dataTransfer.files) collected.push({ path: file.name, file })
      }
      onFiles(await toRecords(collected))
    },
    [onFiles]
  )

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <strong>Drop files to preview</strong>
      <span>react.jsx, .tsx, .ts, .js, .css — or a whole folder</span>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept=".js,.jsx,.ts,.tsx,.mjs,.cjs,.css,.scss,.html,.json,.svg,.md"
        onChange={async (e) => {
          const list = [...e.target.files].map((file) => ({
            path: file.webkitRelativePath || file.name,
            file,
          }))
          onFiles(await toRecords(list))
          e.target.value = ''
        }}
      />
    </div>
  )
}
