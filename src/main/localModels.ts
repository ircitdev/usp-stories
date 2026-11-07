import { once } from 'node:events'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_PACKS, type PackDef, type PackFile } from '@shared/localModels'
import type { ComfyGraph } from './services/comfyui'
import type { ModelFileState, ModelInventory, ModelPackState, ModelProgress } from '@shared/types'
import { emit } from './events'
import * as comfy from './services/comfyui'
import * as voicestudio from './services/voicestudio'
import { getSettings } from './settings'
import { whisperStatus } from './whisper'

/**
 * What is installed for local generation, and installing what is missing. A pack is ready when ComfyUI has every
 * node type its graph uses and every model file it loads: ComfyUI's /object_info lists both (each loader's list of
 * files is what it can actually load). Downloadable files go straight into ComfyUI's models folders, resuming a
 * partial «.part» file; ComfyUI sees them without a restart.
 */

const MODEL_EXT = /\.(safetensors|gguf|pt|pth|ckpt|bin|onnx|sft)$/i

type InputSpec = unknown[]
type ObjectInfo = Record<string, { input?: { required?: Record<string, InputSpec>; optional?: Record<string, InputSpec> } }>

let infoCache: { at: number; data: ObjectInfo } | null = null

async function objectInfo(fresh: boolean): Promise<ObjectInfo | null> {
  if (!fresh && infoCache && Date.now() - infoCache.at < 60_000) return infoCache.data
  const data = await comfy.getJson<ObjectInfo>('/object_info', 30_000)
  infoCache = data ? { at: Date.now(), data } : null
  return data
}

/** The choices of a list input: old style [[...]] or new style ['COMBO', { options }]. */
function optionsOf(spec: InputSpec | undefined): string[] | null {
  if (!spec) return null
  if (Array.isArray(spec[0])) return spec[0] as string[]
  const o = spec[1] as { options?: unknown[] } | undefined
  if (spec[0] === 'COMBO' && Array.isArray(o?.options)) return o.options.filter((x): x is string => typeof x === 'string')
  return null
}

let pathsCache: Record<string, string[]> | null = null

/** The folder on disk a downloaded file goes to: the «models\<folder>» one among ComfyUI's paths for that kind. */
async function folderOnDisk(folder: PackFile['folder']): Promise<string | null> {
  pathsCache ??= await comfy.getJson<Record<string, string[]>>('/internal/folder_paths')
  const all = pathsCache?.[folder] ?? []
  const models = all.filter((p) => /[\\/]models[\\/]/i.test(p))
  return models.find((p) => p.replace(/[\\/]+$/, '').toLowerCase().endsWith(folder)) ?? models[0] ?? all[0] ?? null
}

const active = new Map<string, { ctrl: AbortController; file: string | null; done: number; total: number }>()
const lastError = new Map<string, string>()

/** A «.part» file someone else is still writing (changed in the last 20 seconds). */
function busyPart(part: string): boolean {
  try {
    return Date.now() - statSync(part).mtimeMs < 20_000
  } catch {
    return false
  }
}

async function packState(def: PackDef, info: ObjectInfo | null): Promise<ModelPackState> {
  const path = comfy.workflowPath(def.workflow)
  let graph: ComfyGraph | null = null
  try {
    graph = path ? (JSON.parse(readFileSync(path, 'utf8')) as ComfyGraph) : null
  } catch {
    graph = null
  }
  const missingNodes = new Set<string>()
  const seen = new Map<string, boolean>()
  for (const node of Object.values(graph ?? {})) {
    const cls = info?.[node.class_type]
    if (info && !cls) missingNodes.add(node.class_type)
    for (const [key, value] of Object.entries(node.inputs ?? {})) {
      if (typeof value !== 'string' || !MODEL_EXT.test(value)) continue
      const opts = optionsOf(cls?.input?.required?.[key] ?? cls?.input?.optional?.[key])
      // A loader that does not list its files cannot be checked: counted as present.
      seen.set(value, (seen.get(value) ?? false) || !info || !cls || !opts || opts.includes(value))
    }
  }
  const files: ModelFileState[] = []
  for (const [name, present] of seen) {
    const known = def.files?.find((f) => f.name === name)
    let have = present
    let partBytes: number | null = null
    if (known) {
      const dir = await folderOnDisk(known.folder)
      if (dir) {
        if (existsSync(join(dir, name))) have = true
        const part = join(dir, `${name}.part`)
        if (!have && existsSync(part)) partBytes = statSync(part).size
      }
    }
    files.push({ name, present: have, bytes: known?.bytes ?? null, partBytes, downloadable: !!known })
  }
  const run = active.get(def.id)
  const missing = files.filter((f) => !f.present)
  const external = missing.some((f) => f.partBytes != null && def.files && busyPartOf(def, f.name))
  const toDownload = missing.filter((f) => f.downloadable).reduce((n, f) => n + (f.bytes ?? 0) - (f.partBytes ?? 0), 0)
  const ready = !!graph && !missingNodes.size && !missing.length
  return {
    id: def.id,
    state: run || external ? 'downloading' : ready ? 'ready' : 'missing',
    files,
    missingNodes: [...missingNodes],
    noWorkflow: !graph,
    toDownload,
    canInstall: !!graph && !missingNodes.size && missing.length > 0 && missing.every((f) => f.downloadable)
  }
}

const partPaths = new Map<string, string>()
function busyPartOf(def: PackDef, name: string): boolean {
  const p = partPaths.get(`${def.id}/${name}`)
  return !!p && !active.has(def.id) && busyPart(p)
}

function ollamaBase(): string {
  return (getSettings().customBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
}

async function ollamaModels(): Promise<{ up: boolean; models: { name: string; bytes: number }[] }> {
  try {
    const res = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { up: false, models: [] }
    const body = (await res.json()) as { models?: { name: string; size: number }[] }
    return { up: true, models: (body.models ?? []).map((m) => ({ name: m.name, bytes: m.size })) }
  } catch {
    return { up: false, models: [] }
  }
}

export async function inventory(fresh = false): Promise<ModelInventory> {
  if (fresh) pathsCache = null
  const [info, ollama, vs] = await Promise.all([objectInfo(fresh), ollamaModels(), voicestudio.health()])
  // Where unfinished downloads would be, so a download started elsewhere (or before a restart) shows as running.
  for (const def of MODEL_PACKS)
    for (const f of def.files ?? []) {
      const dir = info ? await folderOnDisk(f.folder) : null
      if (dir) partPaths.set(`${def.id}/${f.name}`, join(dir, `${f.name}.part`))
    }
  const packs = await Promise.all(MODEL_PACKS.map((d) => packState(d, info)))
  for (const p of packs) if (p.state !== 'ready') p.error = lastError.get(p.id) ?? null
  return {
    comfy: !!info,
    packs,
    ollama: { ...ollama, current: getSettings().llmModels?.custom || 'gemma3:27b' },
    voiceStudio: vs,
    whisper: whisperStatus()
  }
}

function reporter(id: string): (p: Omit<ModelProgress, 'id'>, force?: boolean) => void {
  let last = 0
  return (p, force = false) => {
    if (!force && Date.now() - last < 400) return
    last = Date.now()
    emit.models({ id, ...p })
  }
}

/** Downloads one file with resume; `onBytes` gets the bytes written so far. */
async function fetchTo(url: string, target: string, signal: AbortSignal, onBytes: (n: number) => void): Promise<void> {
  const part = `${target}.part`
  const have = existsSync(part) ? statSync(part).size : 0
  const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {}, signal })
  if (res.status === 416) {
    renameSync(part, target)
    return
  }
  if (!res.ok || !res.body) throw new Error(`Не удалось скачать ${url.split('/').pop()} (HTTP ${res.status})`)
  const resumed = res.status === 206
  let done = resumed ? have : 0
  const out = createWriteStream(part, { flags: resumed ? 'a' : 'w' })
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (!out.write(chunk)) await once(out, 'drain')
      done += chunk.length
      onBytes(done)
    }
  } finally {
    out.end()
    await once(out, 'close')
  }
  renameSync(part, target)
}

/** Downloads the pack's missing files one after another. Progress goes out as «models» events. */
export async function installPack(id: string): Promise<void> {
  const def = MODEL_PACKS.find((p) => p.id === id)
  if (!def?.files) throw new Error('Эту модель приложение не умеет скачивать: поставьте её в ComfyUI вручную.')
  if (active.has(id)) return
  const state = await packState(def, await objectInfo(true))
  if (state.missingNodes.length) throw new Error(`В ComfyUI нет узлов ${state.missingNodes.join(', ')}. Обновите ComfyUI и откройте проверку снова.`)
  const todo = def.files.filter((f) => !state.files.find((s) => s.name === f.name)?.present)
  for (const f of todo) {
    const p = partPaths.get(`${id}/${f.name}`)
    if (p && busyPart(p)) throw new Error(`Файл ${f.name} уже скачивается другой программой. Дождитесь конца — проверка покажет готовность.`)
  }
  const total = todo.reduce((n, f) => n + f.bytes, 0)
  const ctrl = new AbortController()
  const run = { ctrl, file: null as string | null, done: 0, total }
  active.set(id, run)
  lastError.delete(id)
  const report = reporter(id)
  let base = 0
  try {
    for (const f of todo) {
      const dir = await folderOnDisk(f.folder)
      if (!dir) throw new Error(`ComfyUI не сообщил папку для ${f.folder}. Запустите ComfyUI и попробуйте снова.`)
      mkdirSync(dir, { recursive: true })
      run.file = f.name
      await fetchTo(f.url, join(dir, f.name), ctrl.signal, (n) => {
        run.done = base + n
        report({ file: f.name, done: run.done, total })
      })
      base += f.bytes
    }
    infoCache = null
    report({ file: null, done: total, total, finished: true }, true)
  } catch (e) {
    const msg = ctrl.signal.aborted ? null : ((e as Error).message ?? String(e))
    if (msg) lastError.set(id, msg)
    report({ file: run.file, done: run.done, total, finished: true, error: msg }, true)
    if (msg) throw e
  } finally {
    active.delete(id)
  }
}

export function cancelInstall(id: string): void {
  active.get(id)?.ctrl.abort()
}

/** Pulls a model into Ollama (it keeps partial layers itself, so a cancelled pull continues later). */
export async function pullOllama(name: string): Promise<void> {
  const id = `ollama:${name}`
  if (active.has(id)) return
  const ctrl = new AbortController()
  const run = { ctrl, file: name, done: 0, total: 0 }
  active.set(id, run)
  const report = reporter(id)
  try {
    const res = await fetch(`${ollamaBase()}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, stream: true }),
      signal: ctrl.signal
    }).catch(() => {
      throw new Error(`Ollama не отвечает по адресу ${ollamaBase()}. Запустите Ollama и попробуйте снова.`)
    })
    if (!res.ok || !res.body) throw new Error(`Ollama не начал загрузку (HTTP ${res.status})`)
    let buf = ''
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += Buffer.from(chunk).toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        const m = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
        if (m.error) throw new Error(`Ollama: ${m.error}`)
        if (m.total) {
          run.total = m.total
          run.done = m.completed ?? 0
        }
        report({ file: m.status ?? name, done: run.done, total: run.total })
      }
    }
    report({ file: null, done: run.total, total: run.total, finished: true }, true)
  } catch (e) {
    const msg = ctrl.signal.aborted ? null : ((e as Error).message ?? String(e))
    report({ file: name, done: run.done, total: run.total, finished: true, error: msg }, true)
    if (msg) throw e
  } finally {
    active.delete(id)
  }
}

/** Progress of everything downloading now, for a page opened in the middle of a download. */
export function downloads(): ModelProgress[] {
  return [...active.entries()].map(([id, r]) => ({ id, file: r.file, done: r.done, total: r.total }))
}

/** Whether a pack can run now (for menus that offer local models). */
export async function packReady(id: string): Promise<boolean> {
  const def = MODEL_PACKS.find((p) => p.id === id)
  if (!def) return false
  return (await packState(def, await objectInfo(false))).state === 'ready'
}

/** ComfyUI's «models» folder, for the «Открыть папку» button. */
export async function modelsRoot(): Promise<string | null> {
  const dir = await folderOnDisk('checkpoints')
  return dir ? dir.replace(/[\/]checkpoints[\/]?$/i, '') : null
}
