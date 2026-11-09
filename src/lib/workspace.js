// Decisions about what an upload means for the workspace that is already open.

import { extractSpecifiers, isRelative, isScript, pickEntry } from './detect.js'
import { resolveRelative } from './compile.js'

/** Incoming files replace same-named ones; everything else is appended. */
export function mergeFiles(current, incoming) {
  const next = [...current]
  for (const file of incoming) {
    const at = next.findIndex((f) => f.name === file.name)
    if (at >= 0) next[at] = file
    else next.push(file)
  }
  return next
}

/**
 * How an upload relates to the files already open:
 *   'fresh'     nothing was open
 *   'update'    every incoming file replaces one that is already there
 *   'related'   the two sets import each other, share a file name, or the upload has no
 *               script at all (a stylesheet or asset joins the project it was dropped on)
 *   'unrelated' a separate component — it belongs in its own project
 */
export function classifyUpload(current, incoming) {
  if (!current.length) return 'fresh'
  const names = new Set(current.map((f) => f.name))
  if (incoming.every((f) => names.has(f.name))) return 'update'
  if (incoming.some((f) => names.has(f.name))) return 'related'
  if (!incoming.some((f) => isScript(f.name))) return 'related'

  const all = mergeFiles(current, incoming)
  const fromUpload = new Set(incoming.map((f) => f.name))
  for (const file of all) {
    if (!isScript(file.name)) continue
    for (const spec of extractSpecifiers(file.content)) {
      if (!isRelative(spec)) continue
      const target = resolveRelative(file.name, spec, all)
      if (target && fromUpload.has(file.name) !== fromUpload.has(target)) return 'related'
    }
  }
  return 'unrelated'
}

/** Is `name` imported by any other file in the set? An imported file is not a root. */
function isImported(name, files) {
  for (const file of files) {
    if (file.name === name || !isScript(file.name)) continue
    for (const spec of extractSpecifiers(file.content)) {
      if (isRelative(spec) && resolveRelative(file.name, spec, files) === name) return true
    }
  }
  return false
}

/**
 * Entry point after merging an upload into the open project: keep the current one while it
 * is still a root, otherwise let detection pick (a new file that imports the old entry wins).
 */
export function entryAfterMerge(files, currentEntry) {
  if (currentEntry && files.some((f) => f.name === currentEntry) && !isImported(currentEntry, files)) {
    return currentEntry
  }
  return pickEntry(files)?.name ?? null
}

/** A project name from its entry file: `src/PickleballCourtBooking.jsx` → `PickleballCourtBooking`. */
export function nameFromEntry(entryName) {
  return entryName ? entryName.split('/').pop().replace(/\.[^.]+$/, '') : 'Untitled project'
}

/**
 * The exact shape autosave compares and stores. Keeping one shape (and key order) means a
 * project that was just opened compares equal to itself and is not re-saved.
 */
export function normalizeWorkspace(workspace, fallbackReact) {
  const files = Array.isArray(workspace?.files) ? workspace.files : []
  const saved = workspace?.entryName
  const entryName = saved && files.some((f) => f.name === saved) ? saved : pickEntry(files)?.name ?? null
  return {
    files,
    entryName,
    installed: Array.isArray(workspace?.installed) ? workspace.installed : [],
    reactVersion: workspace?.reactVersion || fallbackReact,
  }
}
