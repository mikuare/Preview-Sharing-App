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
import { SAMPLES } from './samples/index.js'

const STORAGE_KEY = 'dev-preview:workspace:v1'

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
  const saved = useMemo(loadWorkspace, [])

  const [files, setFiles] = useState(saved?.files ?? [])
  const [entryName, setEntryName] = useState(saved?.entryName ?? null)
  const [activeFile, setActiveFile] = useState(saved?.files?.[0]?.name ?? null)
  const [installed, setInstalled] = useState(saved?.installed ?? [])
  const [reactVersion, setReactVersion] = useState(saved?.reactVersion ?? DEFAULT_REACT_VERSION)

  const [busy, setBusy] = useState([])
  const [depErrors, setDepErrors] = useState({})

  const [html, setHtml] = useState(null)
  const [runKey, setRunKey] = useState(0)
  const [status, setStatus] = useState({ state: 'idle' })
  const [compileErrors, setCompileErrors] = useState([])
  const [missingDeps, setMissingDeps] = useState([])
  const [messages, setMessages] = useState([])

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
  const [saving, setSaving] = useState(false)

  const dependencies = useMemo(() => collectDependencies(files), [files])
  const tailwind = useMemo(() => detectTailwind(files), [files])

  // ---- persistence ---------------------------------------------------------

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ files, entryName, installed, reactVersion }))
      } catch {
        /* quota — the workspace just won't be restored next time */
      }
    }, 400)
    return () => clearTimeout(id)
  }, [files, entryName, installed, reactVersion, dependencies])

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

  // ---- files ---------------------------------------------------------------

  const addFiles = useCallback((incoming) => {
    if (!incoming.length) return
    setFiles((prev) => {
      const next = [...prev]
      for (const file of incoming) {
        const at = next.findIndex((f) => f.name === file.name)
        if (at >= 0) next[at] = file
        else next.push(file)
      }
      const entry = pickEntry(next)
      setEntryName((current) => (current && next.some((f) => f.name === current) ? current : entry?.name ?? null))
      setActiveFile(incoming[0].name)
      return next
    })
  }, [])

  const removeFile = useCallback((name) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.name !== name)
      setEntryName((current) => (current === name ? pickEntry(next)?.name ?? null : current))
      setActiveFile((current) => (current === name ? next[0]?.name ?? null : current))
      if (!next.length) {
        setHtml(null)
        setStatus({ state: 'idle' })
        setCompileErrors([])
        setMissingDeps([])
      }
      return next
    })
  }, [])

  const updateActive = useCallback(
    (content) => {
      setFiles((prev) =>
        prev.map((f) => (f.name === activeFile ? { ...f, content, size: content.length } : f))
      )
    },
    [activeFile]
  )

  const loadSample = (sample) => {
    setFiles(sample.files)
    setEntryName(sample.entry)
    setActiveFile(sample.files[0].name)
    setMessages([])
  }

  const newProject = () => {
    setProjectId(null)
    setProjectName('Untitled project')
    setFiles([])
    setEntryName(null)
    setActiveFile(null)
    setInstalled([])
    setHtml(null)
    setMessages([])
    setCompileErrors([])
    setMissingDeps([])
    setStatus({ state: 'idle' })
    setProjectsOpen(false)
  }

  const renameProject = async (id, name) => {
    await saveProject(id, { name })
    if (id === projectId) setProjectName(name)
    refreshProjects()
  }

  const removeProject = async (id) => {
    await deleteProject(id)
    const list = await refreshProjects()
    if (id === projectId) {
      if (list.length) await openProject(list[0].id)
      else newProject()
    }
  }

  const clearAll = () => {
    setFiles([])
    setEntryName(null)
    setActiveFile(null)
    setHtml(null)
    setMessages([])
    setCompileErrors([])
    setMissingDeps([])
    setStatus({ state: 'idle' })
  }

  // ---- deep links: ?sample=dashboard&install=tailwindcss,xlsx --------------

  const bootstrapped = useRef(false)

  const applyWorkspace = useCallback((workspace) => {
    setFiles(workspace.files || [])
    setEntryName(workspace.entryName ?? workspace.files?.[0]?.name ?? null)
    setActiveFile(workspace.files?.[0]?.name ?? null)
    setInstalled(workspace.installed ?? [])
    setReactVersion(workspace.reactVersion || DEFAULT_REACT_VERSION)
  }, [])

  const refreshProjects = useCallback(async () => {
    try {
      const { projects: list } = await listProjects()
      setProjects(list)
      return list
    } catch {
      return []
    }
  }, [])

  const openProject = useCallback(
    async (id) => {
      const { project, workspace } = await loadProject(id)
      setProjectId(project.id)
      setProjectName(project.name)
      applyWorkspace(workspace)
      setProjectsOpen(false)
      setMessages([])
    },
    [applyWorkspace]
  )

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    ;(async () => {
      const me = await serverStatus()
      if (!me) {
        // No share server: keep working, browser-only.
        const saved = loadWorkspace()
        if (saved) applyWorkspace(saved)
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

      setSession({ state: 'ready', user: me.user, providers, config: me.config })

      const params = new URLSearchParams(window.location.search)
      const shared = await workspaceFromLocation()
      const list = await refreshProjects()

      if (shared && Array.isArray(shared.files) && shared.files.length) {
        // Arrived on a workspace link: keep it as a project of their own.
        const { project } = await createProject('Shared copy', shared)
        history.replaceState(null, '', location.pathname)
        await openProject(project.id)
      } else if (params.get('sample')) {
        const sample = SAMPLES.find((s) => s.id === params.get('sample'))
        if (sample) loadSample(sample)
      } else if (list.length) {
        await openProject(list[0].id)
      }

      const wanted = (params.get('install') || '').split(',').map((n) => n.trim()).filter(Boolean)
      for (const name of wanted) installRef.current(name)
    })().catch((err) => {
      console.error('startup failed:', err)
      setSession((prev) => ({ ...prev, state: prev.state === 'loading' ? 'offline' : prev.state }))
    })
  }, [applyWorkspace, openProject, refreshProjects])

  // ---- autosave ------------------------------------------------------------

  const saveState = useRef({ id: null, name: 'Untitled project' })
  saveState.current = { id: projectId, name: projectName }

  useEffect(() => {
    if (session.state !== 'ready' || !files.length) return
    const timer = setTimeout(async () => {
      const workspace = { files, entryName, installed, reactVersion }
      setSaving(true)
      try {
        if (saveState.current.id) {
          await saveProject(saveState.current.id, { workspace })
        } else {
          const name = entryName ? entryName.split('/').pop().replace(/\.[^.]+$/, '') : 'Untitled project'
          const { project } = await createProject(name, workspace)
          setProjectId(project.id)
          setProjectName(project.name)
        }
        await refreshProjects()
      } catch (err) {
        setMessages((prev) => [...prev, { level: 'warn', text: `Could not save project: ${err.message}` }])
      } finally {
        setSaving(false)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [files, entryName, installed, reactVersion, session.state, refreshProjects])

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
    if (!autoRun || !files.length) return
    const id = setTimeout(() => runRef.current(), 500)
    return () => clearTimeout(id)
  }, [autoRun, files, installed, reactVersion, entryName])

  // A preview that never reports back is usually a package that failed to load
  // from the CDN — say so rather than spinning forever.
  useEffect(() => {
    if (status.state !== 'building' || !html) return
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
          <img className="brand-mark" src="/judech-mark.png" alt="" />
          Development Preview
          <small>live</small>
        </div>

        {session.state === 'ready' && (
          <div className="popover-anchor">
            <button className={`btn tiny${projectsOpen ? ' primary' : ''}`} onClick={() => setProjectsOpen((v) => !v)}>
              {projectName} {saving ? '·' : ''} ▾
            </button>
            {projectsOpen && (
              <ProjectMenu
                projects={projects}
                currentId={projectId}
                saving={saving}
                onOpen={openProject}
                onCreate={newProject}
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
              workspace={{ files, entryName, installed, reactVersion }}
              previewHtml={html}
              entryName={entryName}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
        {SAMPLES.map((s) => (
          <button key={s.id} className="btn tiny" title={s.hint} onClick={() => loadSample(s)}>
            {s.label}
          </button>
        ))}
        <button className="btn tiny ghost danger" onClick={clearAll} disabled={!files.length}>
          Clear
        </button>

        {session.state === 'ready' ? (
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
