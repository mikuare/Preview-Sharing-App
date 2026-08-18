// Runs the Vite dev server and the share server together.
// Open http://localhost:5173 — Vite proxies /api, /auth and /s to :8787.

import { spawn } from 'node:child_process'

const procs = [
  { name: 'vite  ', cmd: 'npx', args: ['vite'] },
  { name: 'server', cmd: 'node', args: ['--watch', 'server/index.js'] },
]

const children = procs.map(({ name, cmd, args }) => {
  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  const write = (stream) => (chunk) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) stream.write(`[${name}] ${line}\n`)
  }
  child.stdout.on('data', write(process.stdout))
  child.stderr.on('data', write(process.stderr))
  child.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`)
    stopAll()
  })
  return child
})

let stopping = false
function stopAll() {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)
