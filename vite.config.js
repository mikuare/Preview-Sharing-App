import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where the share server lives during development.
const api = process.env.API_PROXY || 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // The project lives on the Windows filesystem (/mnt/c) via WSL, where
    // inotify events never fire — without polling, edits never reach the browser.
    watch: { usePolling: true, interval: 400, ignored: ['**/node_modules/**', '**/.git/**', '**/data/**', '**/dist/**'] },
    // The share server owns sign-in, the share API and /s/:slug links.
    proxy: {
      '/api': api,
      '/auth': api,
    },
  },
  optimizeDeps: { include: ['@babel/standalone'] },
})
