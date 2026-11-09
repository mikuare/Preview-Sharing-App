import React, { Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// /s/:slug is a shared preview; everything else is the editor. Each page loads only its
// own code, so someone opening a share link never downloads the editor and vice versa.
const App = lazy(() => import('./App.jsx'))
const Viewer = lazy(() => import('./Viewer.jsx'))

const shared = window.location.pathname.match(/^\/s\/([\w-]+)$/)

const Loading = () => (
  <div className="gate">
    <div className="gate-card" style={{ textAlign: 'center' }}>
      <span className="spin" /> Loading…
    </div>
  </div>
)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<Loading />}>{shared ? <Viewer slug={shared[1]} /> : <App />}</Suspense>
  </React.StrictMode>
)
