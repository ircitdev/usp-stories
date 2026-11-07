import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { FolderInsert, FolderSettings, FolderTrack } from '@shared/types'
import { emit } from './events'
import { libraryEntry } from './library'
import { assetAbsPath, dataDir } from './paths'
import { addCharacterRow, charactersOf, getBundle, getProject, insertAsset, listProjects, saveEditor, setCharacterSheet } from './repo'
import { probeDurationMs, probeSize } from './services/audio'
import { getSettings, setSettings } from './settings'

/**
 * A folder on the home screen is a project of its own (e.g. «Телеморе»): its characters, caption look, logos and
 * opening/closing videos. Every video made in the folder starts with them; existing videos can take them in one click.
 * Files live in the app's data folder, folders/<name>/, and are copied into each video that uses them.
 */

export const EMPTY_FOLDER: FolderSettings = { characters: [], captions: {}, logos: [], inserts: [], defaults: {} }

export function folderDir(name: string): string {
  const dir = join(dataDir(), 'folders', name.replace(/[<>:"/\\|?*]+/g, '_').trim() || 'folder')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getFolder(name: string): FolderSettings {
  return { ...EMPTY_FOLDER, ...(getSettings().folderSettings?.[name] ?? {}) }
}

export function setFolder(name: string, patch: Partial<FolderSettings>): FolderSettings {
  const all = { ...(getSettings().folderSettings ?? {}) }
  all[name] = { ...getFolder(name), ...patch }
  setSettings({ folderSettings: all })
  return all[name]
}

export function folderFileUrl(name: string, file: string): string {
  return `studio://folders/${encodeURIComponent(basename(folderDir(name)))}/${encodeURIComponent(file)}`
}

function keep(name: string, src: string): string {
  const file = `${randomUUID().slice(0, 8)}-${basename(src).replace(/[^\w.\-]+/g, '_')}`
  copyFileSync(src, join(folderDir(name), file))
  return file
}

export function addLogos(name: string, paths: string[]): FolderSettings {
  const f = getFolder(name)
  const logos = [...f.logos, ...paths.map((p) => ({ id: randomUUID(), file: keep(name, p), name: basename(p) }))]
  return setFolder(name, { logos })
}

export async function addInserts(name: string, kind: 'intro' | 'outro', paths: string[]): Promise<FolderSettings> {
  const f = getFolder(name)
  const added: FolderInsert[] = []
  for (const p of paths) {
    const file = keep(name, p)
    const abs = join(folderDir(name), file)
    const size = await probeSize(abs).catch(() => null)
    const durationMs = await probeDurationMs(abs).catch(() => null)
    added.push({ id: randomUUID(), kind, file, name: basename(p), width: size?.width ?? null, height: size?.height ?? null, durationMs })
  }
  const inserts = [...f.inserts, ...added]
  // The first variant of each kind and frame shape becomes the default for that shape.
  const defaults = { ...f.defaults }
  for (const a of added) {
    const key = `${a.kind}${(a.height ?? 0) > (a.width ?? 0) ? '916' : '169'}` as keyof FolderSettings['defaults']
    if (!defaults[key]) defaults[key] = a.id
  }
  return setFolder(name, { inserts, defaults })
}

export async function addMusic(name: string, paths: string[]): Promise<FolderSettings> {
  const f = getFolder(name)
  const added = []
  for (const p of paths) {
    const file = keep(name, p)
    added.push({ id: randomUUID(), file, name: basename(p).replace(/\.[^.]+$/, ''), durationMs: await probeDurationMs(join(folderDir(name), file)).catch(() => null) })
  }
  return setFolder(name, { music: [...(f.music ?? []), ...added] })
}

/** Every track of the folder: its own and those of its videos (uploaded or generated there), newest videos first. */
export function folderTracks(name: string): FolderTrack[] {
  const own: FolderTrack[] = (getFolder(name).music ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    url: folderFileUrl(name, m.file),
    durationMs: m.durationMs,
    from: 'folder',
    projectId: null,
    projectTitle: null,
    provider: null
  }))
  const ownNames = new Set(own.map((t) => t.name))
  const fromVideos: FolderTrack[] = []
  for (const p of listProjects().filter((x) => x.folder === name)) {
    for (const a of getBundle(p.id).assets.filter((x) => x.kind === 'music')) {
      // A folder track copied into the video is the same track: shown once.
      if (a.provider === 'local' && !a.model && ownNames.has(a.prompt ?? '')) continue
      fromVideos.push({
        id: a.id,
        name: a.prompt || 'Без названия',
        url: a.url,
        durationMs: a.durationMs,
        from: 'project',
        projectId: p.id,
        projectTitle: p.title,
        provider: a.model || (a.provider === 'local' ? null : a.provider)
      })
    }
  }
  return [...own, ...fromVideos]
}

export function renameFolderFile(name: string, id: string, title: string): FolderSettings {
  const f = getFolder(name)
  const t = title.trim()
  if (!t) return f
  return setFolder(name, {
    logos: f.logos.map((x) => (x.id === id ? { ...x, name: t } : x)),
    inserts: f.inserts.map((x) => (x.id === id ? { ...x, name: t } : x)),
    music: (f.music ?? []).map((x) => (x.id === id ? { ...x, name: t } : x))
  })
}

export function removeFolderFile(name: string, id: string): FolderSettings {
  const f = getFolder(name)
  const gone = [...f.logos, ...f.inserts, ...(f.music ?? [])].find((x) => x.id === id)
  if (gone) rmSync(join(folderDir(name), gone.file), { force: true })
  const defaults = Object.fromEntries(Object.entries(f.defaults).filter(([, v]) => v !== id)) as FolderSettings['defaults']
  return setFolder(name, {
    logos: f.logos.filter((x) => x.id !== id),
    inserts: f.inserts.filter((x) => x.id !== id),
    music: (f.music ?? []).filter((x) => x.id !== id),
    defaults
  })
}

/** Copies a folder file into the project as an asset, once (matched by its original name). */
async function copyIn(projectId: string, name: string, item: { file: string; name: string }, kind: 'overlay' | 'intro' | 'outro' | 'music'): Promise<string> {
  const b = getBundle(projectId)
  const have = b.assets.find((a) => a.kind === kind && a.prompt === item.name)
  if (have) return have.id
  const rel = `${kind === 'overlay' ? 'overlays' : kind}/${randomUUID()}${extname(item.file).toLowerCase()}`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  copyFileSync(join(folderDir(name), item.file), abs)
  const size = await probeSize(abs).catch(() => null)
  const durationMs = kind === 'overlay' ? null : await probeDurationMs(abs).catch(() => null)
  const a = insertAsset({ projectId, kind, provider: 'local', prompt: item.name, localPath: rel, width: size?.width ?? null, height: size?.height ?? null, durationMs })
  emit.asset(a)
  return a.id
}

/** Gives a video its folder's settings: caption look, characters, logos and the default opening/closing videos. */
export async function applyFolder(name: string, projectId: string): Promise<void> {
  const f = getFolder(name)
  const project = getProject(projectId)
  const vertical = project.aspectRatio === '9:16'
  const editor = { ...project.editor, ...f.captions }
  for (const l of f.logos) await copyIn(projectId, name, l, 'overlay')
  // The folder's tracks are there to choose from in the video (Монтаж › Музыка).
  for (const m of f.music ?? []) await copyIn(projectId, name, m, 'music')
  for (const kind of ['intro', 'outro'] as const) {
    const id = f.defaults[`${kind}${vertical ? '916' : '169'}` as keyof FolderSettings['defaults']]
    const item = f.inserts.find((x) => x.id === id)
    if (item) editor[kind === 'intro' ? 'introAssetId' : 'outroAssetId'] = await copyIn(projectId, name, item, kind)
  }
  saveEditor(projectId, editor)
  const have = new Set(charactersOf(projectId).map((c) => c.name.trim().toLowerCase()))
  for (const libId of f.characters) {
    let e
    try {
      e = libraryEntry(libId)
    } catch {
      continue
    }
    if (have.has(e.name.trim().toLowerCase())) continue
    const charId = addCharacterRow(projectId, { name: e.name, description: e.description, manner: e.manner, expression: e.expression, flowName: e.flowName })
    if (e.sheetPath && existsSync(e.sheetPath)) {
      const rel = `images/${randomUUID()}${extname(e.sheetPath).toLowerCase()}`
      const abs = assetAbsPath(projectId, rel)
      mkdirSync(dirname(abs), { recursive: true })
      copyFileSync(e.sheetPath, abs)
      const size = await probeSize(abs).catch(() => null)
      const a = insertAsset({ projectId, characterId: charId, kind: 'image', provider: 'local', prompt: basename(e.sheetPath), localPath: rel, width: size?.width ?? null, height: size?.height ?? null })
      emit.asset(a)
      setCharacterSheet(charId, a.id)
    }
  }
}
