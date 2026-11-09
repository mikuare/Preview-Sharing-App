import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Dropzone from './components/Dropzone.jsx'
import FileList from './components/FileList.jsx'
import DependencyPanel from './components/DependencyPanel.jsx'
import PreviewPane from './components/PreviewPane.jsx'
import ConsolePanel from './components/ConsolePanel.jsx'
import CodeEditor from './components/CodeEditor.jsx'
import { collectDependencies, detectTailwind, pickEntry } from './lib/detect.js'
import { buildBundle, ensureCompiler } from './lib/compile.js'
import { buildPreviewHtml } from './lib/buildPreview.js'
import { DEFAULT_REACT_VERSION, REACT_VERSIONS, SPECIAL, resolvePackage } from './lib/registry.js'
import { classifyUpload, entryAfterMerge, mergeFiles, nameFromEntry, normalizeWorkspace } from './lib/workspace.js'
import SharePanel from './components/SharePanel.jsx'
import SignInGate from './components/SignInGate.jsx'
import ProjectMenu from './components/ProjectMenu.jsx'
import { workspaceFromLocation } from './lib/share.js'
import {
  authProviders,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  saveProject,
  serverStatus,
  signOut,
} from './lib/api.js'

const STORAGE_KEY = 'dev-preview:workspace:v1'

/** Browser-only copy of the workspace — used only when no share server is reachable. */
function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    return Array.isArray(saved.files) ? saved : null
  } catch {
    return null
  }
}

export default function App() {
  // The editor starts empty. A signed-in user's project comes from the server, and an
  // offline editor restores its browser copy during startup. Showing a stale local copy
  // first would run the previous files' preview — and could save them as a duplicate.
  const [files, setFiles] = useState([])
  const [entryName, setEntryName] = useState(null)
  const [activeFile, setActiveFile] = useState(null)
  const [installed, setInstalled] = useState([])
  const [reactVersion, setReactVersion] = useState(DEFAULT_REACT_VERSION)

  const [busy, setBusy] = useState([])
  const [depErrors, setDepErrors] = useState({})

  const [html, setHtml] = useState(null)
  const [runKey, setRunKey] = useState(0)
  const [status, setStatus] = useState({ state: 'idle' })
  const [compileErrors, setCompileErrors] = useState([])
  const [missingDeps, setMissingDeps] = useState([])
  const [messages, setMessages] = useState([])
  const [notice, setNotice] = useState(null) // { text, tone: 'info' | 'warn' }

  const [autoRun, setAutoRun] = useState(true)
  const [device, setDevice] = useState('full')
  const [showCode, setShowCode] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)

  // Session: uploads belong to an account, so the editor waits for one. When no
  // share server is reachable at all (plain `npm run dev`), the editor falls
  // back to browser-only storage rather than locking itself.
  const [session, setSession] = useState({ state: 'loading', user: null, providers: [], config: null })
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState(null)
  const [projectName, setProjectName] = useState('Untitled project')
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [saving, setSaving] = useState(0) // saves in flight

  const workspace = useMemo(() => ({ files, entryName, installed, reactVersion }), [files, entryName, installed, reactVersion])
  const dependencies = useMemo(() => collectDependencies(files), [files])
  const tailwind = useMemo(() => detectTailwind(files), [files])

  // Async work (saves, uploads, project loads) reads the latest values through refs so a
  // callback created a few renders ago never acts on an older workspace.
  const wsRef = useRef(workspace)
  wsRef.current = workspace
  const sessionRef = useRef(session.state)
  sessionRef.current = session.state
  const nameRef = useRef(projectName)
  nameRef.current = projectName

  const say = useCallback((text, tone = 'info') => setNotice({ text, tone }), [])

  useEffect(() => {
    if (!notice) return undefined
    const id = setTimeout(() => setNotice(null), notice.tone === 'warn' ? 12000 : 8000)
    return () => clearTimeout(id)
  }, [notice])

  // ---- browser-only persistence (no share server) --------------------------

  useEffect(() => {
    if (session.state !== 'offline') return undefined
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
      } catch {
        /* quota — the workspace just won't be restored next time */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [workspace, session.state])

  // ---- messages from the preview iframe -----------------------------------

  useEffect(() => {
    const onMessage = (event) => {
      const data = event.data
      if (!data || data.__dp !== true) return
      if (data.type === 'console') {
        setMessages((prev) => [...prev.slice(-299), { level: data.level, text: data.text }])
      } else if (data.type === 'error') {
        setMessages((prev) => [...prev.slice(-299), { level: 'error', text: `${data.title}\n${data.detail}` }])
        setStatus({ state: 'error' })
      } else if (data.type === 'boot') {
        setStatus({ state: 'building' })
      } else if (data.type === 'ready') {
        setStatus({ state: 'ready', ms: data.ms })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // ---- saving ----------------------------------------------------------------

  const refreshProjects = useCallback(async () => {
    try {
      const { projects: list } = await listProjects()
      setProjects(list)
      return list
    } catch {
      return []
    }
  }, [])

  // The project the open workspace saves into. Every switch replaces this object rather
  // than editing it, so a save that finishes late still lands in the project it was
  // started for. `sig` is the last workspace known to be on the server; `queue` keeps one
  // project's saves in order (and stops a slow first save from creating the project twice).
  const binding = useRef({ id: null, sig: '', deleted: false, queue: null })

  const saveInto = useCallback(
    async (target, ws) => {
      if (target.deleted) return
      if (!target.id && !ws.files.length) return // nothing worth creating a project for
      const sig = JSON.stringify(ws)
      if (target.id && target.sig === sig) return // unchanged — no write, no reordering
      setSaving((n) => n + 1)
      try {
        if (target.id) {
          await saveProject(target.id, { workspace: ws })
        } else {
          const { project } = await createProject(nameFromEntry(ws.entryName), ws)
          target.id = project.id
          if (binding.current === target) {
            setProjectId(project.id)
            setProjectName(project.name)
          }
        }
        target.sig = sig
        refreshProjects()
      } catch (err) {
        if (!target.deleted) say(`Could not save the project: ${err.message}`, 'warn')
      } finally {
        setSaving((n) => n - 1)
      }
    },
    [refreshProjects, say]
  )

  const persist = useCallback(
    (target, ws) => {
      target.queue = (target.queue || Promise.resolve()).then(() => saveInto(target, ws))
      return target.queue
    },
    [saveInto]
  )

  useEffect(() => {
    if (session.state !== 'ready') return undefined
    const target = binding.current
    const id = setTimeout(() => persist(target, workspace), 1200)
    return () => clearTimeout(id)
  }, [workspace, session.state, persist])

  // ---- switching what is open ------------------------------------------------

  const resetPreview = useCallback(() => {
    setHtml(null)
    setStatus({ state: 'idle' })
    setCompileErrors([])
    setMissingDeps([])
    setMessages([])
    setDepErrors({})
  }, [])

  /**
   * Every switch goes through here: save what is open (the autosave debounce would drop the
   * last second of edits), bind to the next project, and show it with a clean preview —
   * never the previous project's frame, errors or console.
   */
  const switchTo = useCallback(
    (project, ws, { closeMenu = true } = {}) => {
      if (sessionRef.current === 'ready') persist(binding.current, wsRef.current)
      binding.current = { id: project?.id ?? null, sig: project ? JSON.stringify(ws) : '', deleted: false, queue: null }
      setProjectId(project?.id ?? null)
      setProjectName(project?.name ?? nameFromEntry(ws.entryName))
      setFiles(ws.files)
      setEntryName(ws.entryName)
      setActiveFile(ws.entryName ?? ws.files[0]?.name ?? null)
      setInstalled(ws.installed)
      setReactVersion(ws.reactVersion)
      resetPreview()
      if (closeMenu) setProjectsOpen(false)
    },
    [persist, resetPreview]
  )

  // Bumped by every switch, so a project that finishes loading after a later click is dropped.
  const openTicket = useRef(0)

  const openProject = useCallback(
    async (id, options) => {
      if (id === binding.current.id) {
        if (!options || options.closeMenu !== false) setProjectsOpen(false)
        return
      }
      const ticket = ++openTicket.current
      try {
        const { project, workspace: saved } = await loadProject(id)
        if (ticket !== openTicket.current) return
        switchTo(project, normalizeWorkspace(saved, DEFAULT_REACT_VERSION), options)
      } catch (err) {
        if (ticket === openTicket.current) say(`Could not open that project: ${err.message}`, 'warn')
      }
    },
    [switchTo, say]
  )

  const newProject = useCallback(
    (options) => {
      openTicket.current += 1
      switchTo(null, { files: [], entryName: null, installed: [], reactVersion: wsRef.current.reactVersion }, options)
    },
    [switchTo]
  )

  const renameProject = async (id, name) => {
    try {
      await saveProject(id, { name })
      if (id === binding.current.id) setProjectName(name)
      refreshProjects()
    } catch (err) {
      say(`Could not rename the project: ${err.message}`, 'warn')
    }
  }

  const removeProject = async (id) => {
    const target = binding.current
    const isOpen = id === target.id
    if (isOpen) target.deleted = true // nothing may save into it any more
    try {
      await deleteProject(id)
    } catch (err) {
      target.deleted = false
      say(`Could not delete the project: ${err.message}`, 'warn')
      return
    }
    const list = await refreshProjects()
    if (isOpen && binding.current === target) {
      // Keep the menu open so several projects can be cleaned up in a row.
      if (list.length) await openProject(list[0].id, { closeMenu: false })
      else newProject({ closeMenu: false })
    }
  }

  // ---- files ---------------------------------------------------------------

  const addFiles = useCallback(
    (incoming) => {
      if (!incoming.length) return
      const current = wsRef.current
      const kind = classifyUpload(current.files, incoming)

      // A separate component dropped onto an open project gets a project of its own, so
      // the preview shows what was just uploaded and the earlier work stays as it was.
      if (kind === 'unrelated' && sessionRef.current === 'ready') {
        const previous = nameRef.current
        openTicket.current += 1
        const ws = normalizeWorkspace({ files: incoming, reactVersion: current.reactVersion }, DEFAULT_REACT_VERSION)
        switchTo(null, ws)
        say(`Opened ${nameFromEntry(ws.entryName)} as a new project. "${previous}" is still saved under your projects.`)
        return
      }

      const next = mergeFiles(current.files, incoming)
      // Without projects (offline) the upload still joins this workspace, but the preview
      // moves to the file that was just dropped.
      const entry =
        kind === 'unrelated'
          ? pickEntry(incoming)?.name ?? entryAfterMerge(next, current.entryName)
          : entryAfterMerge(next, current.entryName)
      setFiles(next)
      setEntryName(entry)
      setActiveFile(incoming.some((f) => f.name === entry) ? entry : incoming[0].name)
      if (kind === 'fresh' && !binding.current.id) setProjectName(nameFromEntry(entry))
      if (kind === 'unrelated') say(`Now previewing ${entry}. Use the entry button on a file to switch back.`)
    },
    [switchTo, say]
  )

  const removeFile = useCallback(
    (name) => {
      const current = wsRef.current
      const next = current.files.filter((f) => f.name !== name)
      setFiles(next)
      setEntryName(current.entryName === name ? pickEntry(next)?.name ?? null : current.entryName)
      setActiveFile((prev) => (prev === name ? next[0]?.name ?? null : prev))
      if (!next.length) resetPreview()
    },
    [resetPreview]
  )

  const updateActive = useCallback(
    (content) => {
      setFiles((prev) =>
        prev.map((f) => (f.name === activeFile ? { ...f, content, size: content.length } : f))
      )
    },
    [activeFile]
  )

  // ---- startup: session, then the right project ------------------------------
  // Deep link: ?install=tailwindcss,xlsx installs packages into whatever opens.

  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    ;(async () => {
      const me = await serverStatus()
      if (!me) {
        // No share server: keep working, browser-only.
        const saved = loadWorkspace()
        if (saved) switchTo(null, normalizeWorkspace(saved, DEFAULT_REACT_VERSION))
        setSession({ state: 'offline', user: null, providers: [], config: null })
        return
      }

      let providers = []
      try {
        providers = (await authProviders()).providers
      } catch {
        providers = []
      }

      if (!me.user) {
        setSession({ state: 'anonymous', user: null, providers, config: me.config })
        return
      }

      // The editor stays on the loading screen until the project is open, so nothing can be
      // dropped into (or autosaved from) a workspace that is about to be replaced.
      try {
        const params = new URLSearchParams(window.location.search)
        const shared = await workspaceFromLocation()
        const list = await refreshProjects()

        if (shared && Array.isArray(shared.files) && shared.files.length) {
          // Arrived on a workspace link: keep it as a project of their own.
          const { project } = await createProject('Shared copy', shared)
          history.replaceState(null, '', location.pathname)
          refreshProjects()
          await openProject(project.id)
        } else if (list.length) {
          await openProject(list[0].id)
        }

        const wanted = (params.get('install') || '').split(',').map((n) => n.trim()).filter(Boolean)
        for (const name of wanted) installRef.current(name)
      } catch (err) {
        say(`Could not load your projects: ${err.message}`, 'warn')
      } finally {
        setSession({ state: 'ready', user: me.user, providers, config: me.config })
      }
    })().catch((err) => {
      console.error('startup failed:', err)
      setSession((prev) => ({ ...prev, state: prev.state === 'loading' ? 'offline' : prev.state }))
    })
  }, [switchTo, openProject, refreshProjects, say])

  // ---- install / uninstall -------------------------------------------------

  const install = useCallback(
    async (name, version = 'latest') => {
      const clean = name.trim()
      if (!clean) return
      setDepErrors((prev) => ({ ...prev, [clean]: undefined }))
      setBusy((prev) => [...prev, clean])
      try {
        const special = SPECIAL[clean]
        const pkg = special
          ? {
              name: clean,
              version: version === 'latest' ? special.defaultVersion : version,
              description: special.blurb,
              kind: special.kind,
            }
          : await resolvePackage(clean, version)
        setInstalled((prev) => [...prev.filter((p) => p.name !== pkg.name), pkg].sort((a, b) => a.name.localeCompare(b.name)))
      } catch (err) {
        setDepErrors((prev) => ({ ...prev, [clean]: err.message }))
      } finally {
        setBusy((prev) => prev.filter((n) => n !== clean))
      }
    },
    []
  )

  const uninstall = useCallback((name) => {
    setInstalled((prev) => prev.filter((p) => p.name !== name))
  }, [])

  const installRef = useRef(install)
  installRef.current = install

  // ---- build & run ---------------------------------------------------------

  const run = useCallback(async () => {
    if (!files.length) return
    setMessages([])

    // A bare import of a package that was never installed would fail deep inside
    // the iframe, so ask for the install up front instead.
    const installedNames = new Set(installed.map((p) => p.name))
    const missing = dependencies.filter((d) => !installedNames.has(d.name))
    setMissingDeps(missing)
    if (missing.length) {
      setStatus({ state: 'blocked' })
      setHtml(null)
      return
    }

    setStatus({ state: 'building' })
    try {
      await ensureCompiler()
      const bundle = buildBundle(files, entryName)
      const fatal = bundle.errors.filter((e) => e.kind === 'syntax' || e.kind === 'cycle')
      setCompileErrors(fatal)
      const soft = bundle.errors.filter((e) => !fatal.includes(e))
      if (soft.length) {
        setMessages((prev) => [...prev, ...soft.map((e) => ({ level: 'warn', text: `${e.file}: ${e.message}` }))])
      }
      if (fatal.length) {
        setStatus({ state: 'error' })
        setHtml(null)
        return
      }
      setHtml(buildPreviewHtml({ bundle, installed, files, reactVersion }))
      setRunKey((k) => k + 1)
    } catch (err) {
      setCompileErrors([{ file: entryName || 'project', kind: 'build', message: String(err.message || err) }])
      setStatus({ state: 'error' })
      setHtml(null)
    }
  }, [files, entryName, installed, reactVersion, dependencies])

  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    if (!autoRun || !files.length) return undefined
    const id = setTimeout(() => runRef.current(), 500)
    return () => clearTimeout(id)
  }, [autoRun, files, installed, reactVersion, entryName])

  // A preview that never reports back is usually a package that failed to load
  // from the CDN — say so rather than spinning forever.
  useEffect(() => {
    if (status.state !== 'building' || !html) return undefined
    const id = setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          level: 'warn',
          text:
            'The preview has not finished loading after 15s. A package may be failing to load from esm.sh — ' +
            'check the pinned versions on the left, or open the preview in a new tab to inspect it.',
        },
      ])
    }, 15000)
    return () => clearTimeout(id)
  }, [status.state, html, runKey])

  const active = files.find((f) => f.name === activeFile) || null
  const signedIn = session.state === 'ready'

  if (session.state === 'loading') {
    return (
      <div className="gate">
        <div className="gate-card" style={{ textAlign: 'center' }}>
          <span className="spin" /> Loading…
        </div>
      </div>
    )
  }

  if (session.state === 'anonymous') {
    return <SignInGate providers={session.providers} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/U.png" alt="Uniflex" width="22" height="22" />
          Development Preview
          <small>live</small>
        </div>

        {signedIn && (
          <div className="popover-anchor">
            <button
              className={`btn tiny${projectsOpen ? ' primary' : ''}`}
              title="Open, rename or delete your projects"
              onClick={() => setProjectsOpen((v) => !v)}
            >
              {projectName} {saving ? '·' : ''} ▾
            </button>
            {projectsOpen && (
              <ProjectMenu
                projects={projects}
                currentId={projectId}
                saving={saving > 0}
                onOpen={openProject}
                onCreate={() => newProject()}
                onRename={renameProject}
                onDelete={removeProject}
                onClose={() => setProjectsOpen(false)}
              />
            )}
          </div>
        )}

        <span className="spacer" />

        <label className="status" style={{ color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          React
          <select className="field" style={{ width: 'auto' }} value={reactVersion} onChange={(e) => setReactVersion(e.target.value)}>
            {REACT_VERSIONS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>

        <button className={`btn tiny${showCode ? ' primary' : ''}`} onClick={() => setShowCode((v) => !v)}>
          Code
        </button>
        <div className="popover-anchor">
          <button
            className={`btn tiny${shareOpen ? ' primary' : ''}`}
            disabled={!files.length}
            onClick={() => setShareOpen((v) => !v)}
          >
            Share
          </button>
          {shareOpen && (
            <SharePanel
              projectId={projectId}
              workspace={workspace}
              previewHtml={html}
              entryName={entryName}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
        <button
          className="btn tiny"
          onClick={() => newProject()}
          disabled={!files.length}
          title={signedIn ? 'Start a blank project. This one stays saved under your projects.' : 'Clear the workspace'}
        >
          {signedIn ? 'New project' : 'Clear'}
        </button>

        {signedIn ? (
          <>
            <span className="share-meta account-email" title={session.user.email}>{session.user.email}</span>
            <button className="btn tiny ghost" onClick={() => signOut().then(() => location.reload())}>
              Sign out
            </button>
          </>
        ) : (
          <span className="badge pending" title="No share server reachable — this workspace stays in your browser">
            local only
          </span>
        )}
      </header>

      <div className={`workspace${showCode ? ' with-code' : ''}`}>
        <aside className="sidebar">
          <div className="section">
            <div className="section-head">
              Files
              <span className="count">{files.length}</span>
            </div>
            <Dropzone onFiles={addFiles} />
            {notice && (
              <div className={`notice ${notice.tone}`} role="status">
                <span>{notice.text}</span>
                <button className="btn tiny ghost" aria-label="Dismiss" onClick={() => setNotice(null)}>
                  ✕
                </button>
              </div>
            )}
            <div className="section-body" style={{ paddingTop: 0 }}>
              <FileList
                files={files}
                activeFile={activeFile}
                entryName={entryName}
                onSelect={(name) => {
                  setActiveFile(name)
                  setShowCode(true)
                }}
                onSetEntry={setEntryName}
                onRemove={removeFile}
              />
            </div>
          </div>

          <div className="section">
            <DependencyPanel
              detected={dependencies}
              installed={installed}
              tailwind={tailwind}
              busy={busy}
              errors={depErrors}
              onInstall={install}
              onUninstall={uninstall}
              onVersion={(name, version) => install(name, version)}
            />
          </div>
        </aside>

        {showCode && <CodeEditor file={active} onChange={updateActive} onClose={() => setShowCode(false)} />}

        <div className="main">
          <PreviewPane
            html={html}
            runKey={runKey}
            status={status}
            compileErrors={compileErrors}
            missingDeps={missingDeps}
            onInstallMissing={() => missingDeps.forEach((d) => install(d.name))}
            tailwindHint={tailwind.likely && !installed.some((p) => p.name === 'tailwindcss')}
            device={device}
            onDevice={setDevice}
            autoRun={autoRun}
            onToggleAuto={() => setAutoRun((v) => !v)}
            onRun={run}
            hasFiles={files.length > 0}
          />
          <ConsolePanel
            messages={messages}
            open={consoleOpen}
            onToggle={() => setConsoleOpen((v) => !v)}
            onClear={() => setMessages([])}
          />
        </div>
      </div>
    </div>
  )
}
