import * as flow from './services/flow'
import type { UsagePeriod } from '@shared/types'
import { inScope, usageReport } from './usage'
import { getDb } from './db'
import { randomUUID } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  ApiProvider,
  AppSettings,
  AspectRatio,
  ExportOptions,
  KeyTestResult,
  ModelSource,
  NewProjectInput,
  ProjectSnapshot,
  TtsProvider,
  VoiceOption,
  WordTiming,
  LocalStatus,
  LibraryCharacterInput,
  CardMode
} from '@shared/types'
import { startExport } from './exporter'
import {
  estimateCredits,
  forgetEstimates,
  generateCharacterSheet,
  generateClipImage,
  generateClipTts,
  generateClipVideo,
  generateMissingImages,
  generateMissingVideos,
  generateMissingTts,
  setActiveAsset
} from './generation'
import { makeCard } from './cardgen'
import { characterFromVideo } from './charvideo'
import { cancelJob } from './jobs'
import { dataUrl, libraryEntry, listLibrary, prepareVoiceSample, removeLibraryCharacter, saveLibraryCharacter } from './library'
import { generateNarration, syncCaptions } from './narration'
import { cancelDownload, downloadModel, openModelFolder, removeModel, whisperStatus } from './whisper'
import { assetAbsPath, dataDir, projectsRoot, userFontsDir } from './paths'
import { makeCover } from './cover'
import { generateMusic, type MusicSource } from './music'
import * as localModels from './localModels'
import { addInserts, addLogos, addMusic, applyFolder, folderFileUrl, folderTracks, getFolder, removeFolderFile, renameFolderFile, setFolder as setFolderSettings } from './folders'
import { basePromptFromUrl, basePromptFromVideo } from './basePrompt'
import { fontInfo } from './fontMetrics'
import { detachVoice, splitClip } from './editing'
import { emit } from './events'
import {
  createProject,
  duplicateProject,
  getAsset,
  getBundle,
  getCharacter,
  getClip,
  getProject,
  insertAsset,
  listProjects,
  removeProject,
  patchClip,
  removeAsset,
  projectFolder,
  renameAsset,
  saveSnapshot,
  setProjectFolder,
  touchProject,
  setCharacterSheet,
  updateAssetMeta
} from './repo'
import { clearSecret, keyStatuses, recordCheck, revealSecret, setSecret } from './secrets'
import { dropCache, getSettings, setSettings } from './settings'
import { probeDurationMs, probeSize } from './services/audio'
import * as eleven from './services/elevenlabs'
import * as gemini from './services/gemini'
import * as hf from './services/higgsfield'
import * as llm from './services/llm'
import * as comfy from './services/comfyui'
import * as voicestudio from './services/voicestudio'
import { generateScript, generateVisuals, generateMusicPrompt, generateMotionPrompt } from './story'


type Handler = (...args: any[]) => unknown

/** The video (or folder) an IPC call is about, by its first argument: a project id, a clip id or a folder name. */
function scopeOf(channel: string, first: unknown): { projectId?: string; folder?: string } {
  if (typeof first !== 'string' || !first) return {}
  if (channel.startsWith('folders:')) return { folder: first }
  const db = getDb()
  if (db.prepare('SELECT 1 FROM projects WHERE id = ?').get(first)) return { projectId: first }
  const clip = db.prepare('SELECT project_id FROM clips WHERE id = ?').get(first) as { project_id?: string } | undefined
  if (clip?.project_id) return { projectId: clip.project_id }
  const ch = db.prepare('SELECT project_id FROM characters WHERE id = ?').get(first) as { project_id?: string } | undefined
  return ch?.project_id ? { projectId: ch.project_id } : {}
}

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await inScope(scopeOf(channel, args[0]), () => fn(...args))
    } catch (e) {
      // Only the message crosses the IPC boundary; keep it readable for the user.
      throw new Error((e as Error)?.message ?? String(e))
    }
  })
}

async function testProvider(provider: ApiProvider, key?: string): Promise<KeyTestResult> {
  if (provider === 'higgsfield') return hf.testCredentials(key)
  if (provider === 'elevenlabs') return eleven.testKey(key)
  return llm.testLlm(provider, key)
}

function defaultExportFolder(projectId?: string): string {
  const base = getSettings().exportFolder ?? join(app.getPath('videos'), 'USP Stories')
  // A video of a folder (project such as «Телеморе») goes to a subfolder of that name.
  const folder = projectId ? projectFolder(projectId).replace(/[<>:"/\\|?*]+/g, '_').trim() : ''
  if (!folder || basename(base).toLowerCase() === folder.toLowerCase()) return base
  return join(base, folder)
}

export function registerIpc(): void {
  handle('projects:list', () => listProjects())
  handle('projects:create', (input: NewProjectInput) => getBundle(createProject(input).id))
  handle('projects:get', (id: string) => getBundle(id))
  handle('projects:save', (snap: ProjectSnapshot) => ({ updatedAt: saveSnapshot(snap) }))
  handle('projects:remove', (id: string) => removeProject(id))
  handle('projects:duplicate', (id: string) => duplicateProject(id))

  handle('story:script', (projectId: string) => generateScript(projectId))
  handle('story:musicPrompt', (projectId: string) => generateMusicPrompt(projectId))
  handle('story:motionPrompt', (clipId: string, engine: string) => generateMotionPrompt(clipId, engine))
  handle('music:generate', (projectId: string, source: MusicSource) => generateMusic(projectId, source))
  handle('chrome:check', () => flow.checkChrome())
  handle('usage:report', (period: UsagePeriod, filter?: { projectId?: string; folder?: string }) => usageReport(period, filter))
  handle('models:inventory', (fresh?: boolean) => localModels.inventory(!!fresh))
  handle('models:install', (packId: string) => localModels.installPack(packId))
  handle('models:cancel', (id: string) => localModels.cancelInstall(id))
  handle('models:pullOllama', (name: string) => localModels.pullOllama(String(name).trim()))
  handle('models:downloads', () => localModels.downloads())
  handle('models:openFolder', async () => {
    const dir = await localModels.modelsRoot()
    if (!dir) throw new Error('ComfyUI не отвечает — не удалось узнать, где его папка моделей.')
    await shell.openPath(dir)
  })
  handle('story:visuals', (projectId: string, mode: 'missing' | 'all') => generateVisuals(projectId, mode === 'all' ? 'all' : 'missing'))

  handle('generate:clipImage', (clipId: string, modelId?: string | null) => generateClipImage(clipId, modelId))
  handle('generate:clipVideo', (clipId: string, modelId?: string | null) => generateClipVideo(clipId, modelId))
  handle('generate:clipTts', (clipId: string, newTake?: boolean) => generateClipTts(clipId, !!newTake))
  handle('generate:characterSheet', (characterId: string) => generateCharacterSheet(characterId))
  handle('generate:missingImages', (projectId: string) => generateMissingImages(projectId))
  handle('generate:missingVideos', (projectId: string) => generateMissingVideos(projectId))
  handle('generate:missingTts', (projectId: string) => generateMissingTts(projectId))
  handle('generate:narration', (projectId: string, mode: 'missing' | 'all') => generateNarration(projectId, mode === 'all' ? 'all' : 'missing'))
  handle('generate:syncCaptions', (projectId: string, mode?: 'stale' | 'all') => syncCaptions(projectId, mode === 'all' ? 'all' : 'stale'))

  handle('whisper:status', () => whisperStatus())
  // The download runs in the background and reports through whisper events.
  handle('whisper:download', () => {
    void downloadModel().catch(() => {})
  })
  handle('whisper:cancel', () => cancelDownload())
  handle('whisper:remove', () => removeModel())
  handle('whisper:openFolder', () => openModelFolder())
  handle('generate:cancel', (jobId: string) => cancelJob(jobId))
  handle('generate:estimate', (kind: 'image' | 'video', modelId: string, aspect: AspectRatio, seconds?: number, resolution?: string | null) =>
    estimateCredits(kind, modelId, aspect, seconds, resolution)
  )

  handle('assets:setActive', (clipId: string, assetId: string) => setActiveAsset(clipId, assetId))
  handle('clips:split', (clipId: string, atMs: number) => splitClip(clipId, Number(atMs)))
  handle('clips:detachVoice', (clipId: string) => detachVoice(clipId))
  // Caption text fixed by hand in the editor; the words keep their times.
  handle('assets:setWords', (assetId: string, words: WordTiming[]) => {
    const a = getAsset(assetId)
    if (!a || a.kind !== 'audio') throw new Error('Озвучка клипа не найдена')
    const clean = (Array.isArray(words) ? words : [])
      .filter((w) => w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
      .map((w) => ({ text: w.text.trim(), start: Math.max(0, w.start), end: Math.max(w.start, w.end) }))
    updateAssetMeta(a.id, { ...a.meta, words: clean, editedWords: true })
    const fresh = getAsset(a.id)!
    emit.asset(fresh)
    return fresh
  })
  handle('assets:pickMusic', async (projectId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Выберите фоновую музыку',
      filters: [{ name: 'Аудио', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    const src = res.filePaths[0]
    const rel = `music/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const durationMs = await probeDurationMs(abs).catch(() => null)
    return insertAsset({
      projectId,
      kind: 'music',
      provider: 'local',
      prompt: src.split(/[\\/]/).pop() ?? 'музыка',
      localPath: rel,
      durationMs
    })
  })

  // A clip picture from disk instead of a generated one: a real photo of a person for a talking head, or a shot
  // made elsewhere. It becomes a new version of the clip picture, so the generated ones stay selectable.
  handle('clips:pickImage', async (clipId: string, path?: string | null) => {
    let src = path ?? null
    if (!src) {
      const win = BrowserWindow.getFocusedWindow()
      const res = await dialog.showOpenDialog(win!, {
        title: 'Выберите свой кадр для клипа',
        filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
        properties: ['openFile']
      })
      if (res.canceled || !res.filePaths[0]) return null
      src = res.filePaths[0]
    }
    const clip = getClip(clipId)
    const rel = `images/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(clip.projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Не удалось прочитать картинку. Нужен файл PNG, JPG или WebP.')
    const asset = insertAsset({
      projectId: clip.projectId,
      clipId,
      kind: 'image',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      width: size.width,
      height: size.height
    })
    emit.asset(asset)
    patchClip(clipId, { imageAssetId: asset.id })
    emit.clip({ clipId, patch: { imageAssetId: asset.id } })
    return asset
  })

  // A character's own picture as their sheet: a photo card of a real person (with their consent) or a finished
  // model sheet. Clip videos made with a reference model then keep this face.
  const importSheet = async (characterId: string, src: string) => {
    const c = getCharacter(characterId)
    const rel = `images/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(c.projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Не удалось прочитать картинку. Нужен файл PNG, JPG или WebP.')
    const asset = insertAsset({
      projectId: c.projectId,
      characterId,
      kind: 'image',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      width: size.width,
      height: size.height
    })
    emit.asset(asset)
    setCharacterSheet(characterId, asset.id)
    emit.character({ characterId, patch: { sheetAssetId: asset.id } })
    return asset
  }
  handle('characters:pickSheet', async (characterId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Выберите лист персонажа или его фото',
      filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return importSheet(characterId, res.filePaths[0])
  })
  handle('library:list', () => listLibrary())
  handle('library:save', (input: LibraryCharacterInput) => saveLibraryCharacter(input))
  handle('library:remove', (id: string) => removeLibraryCharacter(id))
  // Where the character library lives: a folder with characters.json (made empty when missing) and the characters' files.
  handle('library:folder', () => {
    const file = getSettings().charactersRegistry || 'C:/AI/video-kit/characters.json'
    return { file: file.replace(/\//g, '\\'), folder: dirname(file).replace(/\//g, '\\') }
  })
  handle('library:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Папка библиотеки персонажей (в ней лежит или будет создан characters.json)',
      defaultPath: dirname(getSettings().charactersRegistry || 'C:/AI/video-kit/characters.json'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const file = join(res.filePaths[0], 'characters.json').replace(/\\/g, '/')
    if (!existsSync(file)) writeFileSync(file, '[]\n', 'utf8')
    setSettings({ charactersRegistry: file })
    return listLibrary()
  })
  handle('library:openFolder', () => shell.openPath(dirname(getSettings().charactersRegistry || 'C:/AI/video-kit/characters.json')))
  // Caption fonts of the user's own: copied into the app's fonts folder, named by the font itself.
  handle('fonts:add', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Шрифт для субтитров',
      filters: [{ name: 'Шрифты TrueType и OpenType', extensions: ['ttf', 'otf'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled || !res.filePaths.length) return null
    const list = [...(getSettings().customFonts ?? [])]
    let added: string | null = null
    for (const src of res.filePaths) {
      const info = fontInfo(src)
      const file = basename(src).replace(/[^\w.\-]+/g, '_')
      copyFileSync(src, join(userFontsDir(), file))
      const id = `user-${file.toLowerCase().replace(/\.(ttf|otf)$/, '')}`
      const font = { id, name: info.family, family: info.family, cell: info.cell, group: 'Свои шрифты', file, user: true, cyrillic: info.cyrillic }
      const at = list.findIndex((f) => f.id === id)
      if (at >= 0) list[at] = font
      else list.push(font)
      added = id
    }
    setSettings({ customFonts: list })
    return { fonts: list, added }
  })
  handle('fonts:remove', (id: string) => {
    const list = (getSettings().customFonts ?? []).filter((f) => f.id !== id)
    setSettings({ customFonts: list })
    return list
  })
  // ---- folders as projects: their characters, captions, logos, intro/outro ----
  const folderView = (name: string) => {
    const f = getFolder(name)
    return {
      ...f,
      logos: f.logos.map((l) => ({ ...l, url: folderFileUrl(name, l.file) })),
      inserts: f.inserts.map((x) => ({ ...x, url: folderFileUrl(name, x.file) }))
    }
  }
  handle('folders:get', (name: string) => folderView(name))
  handle('folders:tracks', (name: string) => folderTracks(name))
  handle('projects:basePrompt', (projectId: string) => {
    const folder = projectFolder(projectId)
    const bp = folder ? (getFolder(folder).basePrompt ?? null) : null
    return { folder, basePrompt: bp && (bp.brief.trim() || bp.visual.trim() || bp.music.trim()) ? bp : null }
  })
  handle('folders:addMusic', async (name: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: `Музыка проекта «${name}»`,
      filters: [{ name: 'Аудио', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (!res.canceled && res.filePaths.length) await addMusic(name, res.filePaths)
    return folderTracks(name)
  })
  handle('folders:basePromptFromUrl', async (name: string, url: string) => {
    setFolderSettings(name, { basePrompt: await basePromptFromUrl(url) })
    return folderView(name)
  })
  handle('folders:basePromptFromVideo', async (name: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Видео, по которому составить базовый промпт',
      filters: [{ name: 'Видео', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    setFolderSettings(name, { basePrompt: await basePromptFromVideo(res.filePaths[0]) })
    return folderView(name)
  })
  handle('folders:set', (name: string, patch: object) => {
    setFolderSettings(name, patch)
    return folderView(name)
  })
  handle('folders:addLogos', async (name: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: `Логотипы и картинки проекта «${name}»`,
      filters: [{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (!res.canceled && res.filePaths.length) addLogos(name, res.filePaths)
    return folderView(name)
  })
  handle('folders:addInserts', async (name: string, kind: 'intro' | 'outro', paths?: string[]) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = paths?.length
      ? { canceled: false, filePaths: paths }
      : await dialog.showOpenDialog(win!, {
          title: kind === 'intro' ? `Заставки в начало — «${name}»` : `Заставки в конец — «${name}»`,
          filters: [{ name: 'Видео', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }],
          properties: ['openFile', 'multiSelections']
        })
    if (!res.canceled && res.filePaths.length) await addInserts(name, kind, res.filePaths)
    return folderView(name)
  })
  handle('folders:renameFile', (name: string, id: string, title: string) => {
    renameFolderFile(name, id, title)
    return folderView(name)
  })
  handle('assets:rename', (assetId: string, name: string) => renameAsset(assetId, name))
  handle('folders:removeFile', (name: string, id: string) => {
    removeFolderFile(name, id)
    return folderView(name)
  })
  handle('folders:apply', (name: string, projectId: string) => applyFolder(name, projectId))

  // ---- project: folders, cover, media, intro/outro, storage ----
  handle('projects:setFolder', (id: string, folder: string) => setProjectFolder(id, folder))
  handle('projects:makeCover', (id: string) => makeCover(id))
  handle('projects:setCover', (id: string, assetId: string) => touchProject(id, { coverAssetId: assetId }))
  // Several pictures at once (logos, watermarks) into the project's media, for the editor's overlays.
  handle('assets:pickImages', async (projectId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Картинки проекта: логотипы, водяные знаки',
      filters: [{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled) return []
    getProject(projectId)
    const out = []
    for (const src of res.filePaths) {
      const rel = `overlays/${randomUUID()}${extname(src).toLowerCase()}`
      const abs = assetAbsPath(projectId, rel)
      mkdirSync(dirname(abs), { recursive: true })
      copyFileSync(src, abs)
      const size = await probeSize(abs).catch(() => null)
      if (!size) continue
      const a = insertAsset({ projectId, kind: 'overlay', provider: 'local', prompt: basename(src), localPath: rel, width: size.width, height: size.height })
      emit.asset(a)
      out.push(a)
    }
    return out
  })
  // Opening / closing videos: several variants, each remembered with its frame size (9:16 or 16:9).
  handle('assets:pickInserts', async (projectId: string, kind: 'intro' | 'outro', paths?: string[]) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = paths?.length ? { canceled: false, filePaths: paths } : await dialog.showOpenDialog(win!, {
      title: kind === 'intro' ? 'Заставка в начало (preroll)' : 'Заставка в конец (outro)',
      filters: [{ name: 'Видео', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled) return []
    getProject(projectId)
    const out = []
    for (const src of res.filePaths) {
      const rel = `${kind}/${randomUUID()}${extname(src).toLowerCase()}`
      const abs = assetAbsPath(projectId, rel)
      mkdirSync(dirname(abs), { recursive: true })
      copyFileSync(src, abs)
      const size = await probeSize(abs).catch(() => null)
      const durationMs = await probeDurationMs(abs).catch(() => null)
      const a = insertAsset({ projectId, kind, provider: 'local', prompt: basename(src), localPath: rel, width: size?.width ?? null, height: size?.height ?? null, durationMs })
      emit.asset(a)
      out.push(a)
    }
    return out
  })
  handle('assets:remove', (assetId: string) => {
    const a = removeAsset(assetId)
    if (a) rmSync(assetAbsPath(a.projectId, a.localPath), { force: true })
  })
  // Moves every project to another folder on disk and keeps working from there.
  handle('settings:pickProjectsDir', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, { title: 'Папка для проектов', properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const from = projectsRoot()
    const to = res.filePaths[0]
    if (from.replace(/[\\/]+$/, '').toLowerCase() !== to.replace(/[\\/]+$/, '').toLowerCase()) {
      for (const d of readdirSync(from)) {
        const src = join(from, d)
        const dst = join(to, d)
        if (existsSync(dst)) throw new Error(`В новой папке уже есть «${d}». Выберите пустую папку.`)
        cpSync(src, dst, { recursive: true })
      }
      setSettings({ projectsDir: to })
      for (const d of readdirSync(from)) rmSync(join(from, d), { recursive: true, force: true })
    }
    return getSettings()
  })
  handle('library:makeCard', async (photo: string) => {
    const dir = join(dataDir(), 'tmp', 'char-card', `${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const r = await makeCard(photo, dir)
    return { ...r, portraitThumb: dataUrl(r.portrait), sheetThumb: dataUrl(r.sheet) }
  })
  handle('library:fromVideo', async (path: string, opts: { name: string; cloneVoice: boolean; card?: CardMode }) => {
    const r = await characterFromVideo(path, { ...opts, language: getSettings().defaultLanguage })
    return { ...r, portraitThumb: dataUrl(r.portraitPath), sheetThumb: dataUrl(r.sheetPath) }
  })
  handle('characters:sheetFromFile', (characterId: string, path: string) => importSheet(characterId, path))
  handle('library:pickFile', async (kind: 'image' | 'audio' | 'video') => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: kind === 'image' ? 'Выберите картинку персонажа' : kind === 'video' ? 'Выберите видео с человеком' : 'Выберите запись голоса (аудио или видео)',
      filters:
        kind === 'image'
          ? [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          : kind === 'video'
            ? [{ name: 'Видео', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }]
            : [{ name: 'Аудио и видео', extensions: ['wav', 'mp3', 'm4a', 'ogg', 'flac', 'mp4', 'mov', 'mkv', 'webm'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const path = res.filePaths[0]
    return { path, thumb: kind === 'image' ? dataUrl(path) : null }
  })
  handle('library:prepareVoice', (path: string) => prepareVoiceSample(path, getSettings().defaultLanguage))
  handle('library:cloneVoice', (name: string, samplePath: string, text: string) =>
    voicestudio.createProfile(name, samplePath, text, getSettings().defaultLanguage)
  )
  handle('characters:sheetFromLibrary', async (characterId: string, libraryId: string) => {
    const e = libraryEntry(libraryId)
    if (!e.sheetPath) throw new Error(`У персонажа «${e.name}» в библиотеке нет картинки`)
    return importSheet(characterId, e.sheetPath)
  })

  handle('assets:pickImage', async (projectId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Выберите картинку логотипа или водяного знака',
      filters: [{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    const src = res.filePaths[0]
    const rel = `overlays/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Не удалось прочитать картинку. Используйте PNG, JPG или WebP.')
    return insertAsset({
      projectId,
      kind: 'overlay',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      width: size.width,
      height: size.height
    })
  })

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Partial<AppSettings>) => setSettings(patch))
  handle('settings:keys', () => keyStatuses())
  handle('settings:setKey', async (provider: ApiProvider, key: string) => {
    const clean = key.trim()
    if (!clean) throw new Error('Ключ пустой')
    setSecret(provider, clean)
    dropCache(`models:${provider}`)
    if (provider === 'gemini') dropCache('models:gemini-tts')
    if (provider === 'higgsfield') forgetEstimates()
    const result = await testProvider(provider, clean)
    recordCheck(provider, result.ok, result.message)
    return result
  })
  handle('settings:setCustom', async (baseUrl: string, key: string) => {
    const url = baseUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Адрес сервера должен начинаться с http:// или https://')
    setSettings({ customBaseUrl: url })
    if (key.trim()) setSecret('custom', key.trim())
    dropCache('models:custom')
    const result = await llm.testLlm('custom', key.trim() || undefined, url)
    recordCheck('custom', result.ok, result.message)
    return result
  })
  handle('settings:clearKey', (provider: ApiProvider) => {
    clearSecret(provider)
    dropCache(`models:${provider}`)
    if (provider === 'higgsfield') forgetEstimates()
    if (provider === 'custom') setSettings({ customBaseUrl: '' })
  })
  handle('models:list', (source: ModelSource, refresh?: boolean) => llm.listModels(source, !!refresh))
  handle('settings:testKey', async (provider: ApiProvider) => {
    const result = await testProvider(provider).catch((e): KeyTestResult => ({ ok: false, message: (e as Error).message }))
    recordCheck(provider, result.ok, result.message)
    return result
  })
  handle('settings:revealKey', (provider: ApiProvider) => revealSecret(provider))
  handle('settings:voices', async (provider: TtsProvider): Promise<VoiceOption[]> => {
    if (provider === 'gemini') return gemini.listVoices()
    if (provider === 'voicestudio') return voicestudio.listVoices()
    return eleven.listVoices()
  })
  handle('settings:localStatus', async (): Promise<LocalStatus> => {
    const s = getSettings()
    const llmUp = async (): Promise<boolean> => {
      if (s.llmProvider !== 'custom' || !s.customBaseUrl.trim()) return false
      try {
        return (await fetch(s.customBaseUrl.trim().replace(/\/+$/, '') + '/models', { signal: AbortSignal.timeout(2500) })).ok
      } catch {
        return false
      }
    }
    const ollamaUp = async (): Promise<boolean> => {
      const base = (s.customBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
      try {
        return (await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) })).ok
      } catch {
        return false
      }
    }
    const dir = s.comfyWorkflowsDir || 'C:\\AI\\ComfyUI-workflows'
    let workflows: number | null = null
    try {
      workflows = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).length
    } catch {
      workflows = null
    }
    const [c, v, l, o] = await Promise.all([comfy.health(), voicestudio.health(), llmUp(), ollamaUp()])
    return { comfy: c, voiceStudio: v, llm: l, workflows, ollama: o }
  })

  handle('export:start', (projectId: string, opts: ExportOptions) => startExport(projectId, opts))
  handle('export:defaultFolder', (projectId?: string) => defaultExportFolder(projectId))
  handle('export:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Выберите папку для экспорта',
      defaultPath: defaultExportFolder(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    setSettings({ exportFolder: res.filePaths[0] })
    return res.filePaths[0]
  })
  handle('export:reveal', (path: string) => shell.showItemInFolder(path))

  handle('app:version', () => app.getVersion())
  handle('app:copyText', (text: string) => clipboard.writeText(String(text)))
  handle('app:openExternal', (url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
}
