import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Viewer from './Viewer.jsx'
import './styles.css'

// /s/:slug is a shared preview; everything else is the editor.
const shared = window.location.pathname.match(/^\/s\/([\w-]+)$/)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{shared ? <Viewer slug={shared[1]} /> : <App />}</React.StrictMode>
)
