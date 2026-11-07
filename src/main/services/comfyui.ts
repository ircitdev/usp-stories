import { record } from '../usage'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { app } from 'electron'
import { basename, join } from 'node:path'
import { getSettings } from '../settings'
import { sleep } from './http'

/**
 * Local image and video generation through a ComfyUI server on this computer. Workflows are the API-format
 * JSON files from the workflows folder (C:\AI\ComfyUI-workflows); the app only fills in their inputs.
 */

export type ComfyGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>

const CLIENT_ID = randomUUID()

function base(): string {
  return (getSettings().comfyUrl || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '')
}

async function call<T>(path: string, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(base() + path, { ...init, signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error(`ComfyUI не отвечает по адресу ${base()}. Запустите его (ярлык «ComfyUI (картинки и видео)») и попробуйте снова.`)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ComfyUI отклонил запрос (${res.status}): ${text.slice(0, 600)}`)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? await res.json() : await res.text()) as T
}

/** Unloads ComfyUI's models unless it is busy: a local language model (Ollama) needs the graphics memory. */
export async function freeIfIdle(): Promise<void> {
  try {
    const q = (await (await fetch(base() + '/queue', { signal: AbortSignal.timeout(3000) })).json()) as { queue_running?: unknown[]; queue_pending?: unknown[] }
    if (q.queue_running?.length || q.queue_pending?.length) return
    await fetch(base() + '/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.timeout(5000) })
  } catch {
    // ComfyUI is not running: nothing to free.
  }
}

/**
 * Unloads every model Ollama holds in graphics memory. A language model left loaded (the script writer, the base
 * prompt, a video analysis — 17 GB for gemma3:27b) pushes ComfyUI's video models into system memory, and a
 * 10-minute talking head then takes over an hour.
 */
async function unloadOllama(): Promise<void> {
  const base = (getSettings().customBaseUrl || 'http://localhost:11434/v1').trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  if (!/localhost|127\.0\.0\.1/.test(base)) return
  try {
    const ps = (await (await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(2000) })).json()) as { models?: { name: string }[] }
    for (const m of ps.models ?? [])
      await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model: m.name, keep_alive: 0 }), signal: AbortSignal.timeout(15000) }).catch(() => null)
  } catch {
    // Ollama is not running: nothing to unload.
  }
}

/** A GET of ComfyUI's API, or null when it does not answer. */
export async function getJson<T>(path: string, timeoutMs = 20000): Promise<T | null> {
  try {
    const res = await fetch(base() + path, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(base() + '/system_stats', { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

/** Graphs that ship with the app (music), used when the workflows folder has no copy of its own. */
function bundledWorkflow(file: string): string {
  return app.isPackaged ? join(process.resourcesPath, 'workflows', file) : join(app.getAppPath(), 'resources', 'workflows', file)
}

/** Where a graph file is: the workflows folder first, then the copy shipped with the app; null when neither has it. */
export function workflowPath(file: string): string | null {
  const dir = getSettings().comfyWorkflowsDir || 'C:\\AI\\ComfyUI-workflows'
  for (const p of [join(dir, file), bundledWorkflow(file)]) if (existsSync(p)) return p
  return null
}

export function loadWorkflow(file: string): ComfyGraph {
  const dir = getSettings().comfyWorkflowsDir || 'C:\\AI\\ComfyUI-workflows'
  try {
    return JSON.parse(readFileSync(workflowPath(file) ?? join(dir, file), 'utf8')) as ComfyGraph
  } catch {
    throw new Error(`Не найдена схема ComfyUI ${file} в папке ${dir}. Проверьте путь в Настройках › Локальные модели.`)
  }
}

/** Copies a local file into ComfyUI's input folder and returns the name LoadImage nodes use. */
export async function upload(absPath: string, signal: AbortSignal): Promise<string> {
  const form = new FormData()
  const name = `usp-${randomUUID().slice(0, 8)}-${basename(absPath)}`
  form.append('image', new Blob([readFileSync(absPath)]), name)
  form.append('overwrite', 'true')
  const r = await call<{ name: string; subfolder?: string }>('/upload/image', { method: 'POST', body: form }, signal)
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name
}

interface HistoryFile {
  filename: string
  subfolder?: string
  type?: string
}

interface HistoryEntry {
  status?: { status_str?: string; completed?: boolean; messages?: unknown }
  outputs?: Record<string, Record<string, unknown>>
}

async function cancel(promptId: string): Promise<void> {
  try {
    const q = await call<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>('/queue')
    // Only stop the GPU when it is working on this request: other apps may share the same ComfyUI.
    if (q.queue_running?.some((row) => row[1] === promptId)) await call('/interrupt', { method: 'POST' })
    else await call('/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }) })
  } catch {
    /* the server is gone anyway */
  }
}

/**
 * Queues a graph, waits for it and downloads the first output file (videos before images).
 * `onProgress` gets whether the request still waits in the queue and how long it has been running.
 */
export async function run(
  graph: ComfyGraph,
  signal: AbortSignal,
  onProgress: (queued: boolean, elapsedMs: number) => void,
  timeoutMs = 30 * 60 * 1000
): Promise<{ bytes: Buffer; ext: string; promptId: string }> {
  await unloadOllama()
  const queued = await call<{ prompt_id: string }>(
    '/prompt',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: CLIENT_ID }) },
    signal
  )
  const id = queued.prompt_id
  const onAbort = (): void => void cancel(id)
  signal.addEventListener('abort', onAbort, { once: true })
  const started = Date.now()
  let runningSince: number | null = null
  try {
    while (Date.now() - started < timeoutMs) {
      const history = await call<Record<string, HistoryEntry>>(`/history/${id}`, undefined, signal)
      const entry = history[id]
      if (entry?.status?.status_str === 'error') {
        throw new Error('ComfyUI не смог выполнить генерацию: ' + JSON.stringify(entry.status.messages ?? '').slice(0, 800))
      }
      if (entry?.status?.completed) {
        const files: HistoryFile[] = []
        for (const out of Object.values(entry.outputs ?? {}))
          for (const v of Object.values(out)) if (Array.isArray(v)) for (const f of v) if (f && typeof f === 'object' && 'filename' in f) files.push(f as HistoryFile)
        const pick = files.find((f) => /\.(mp4|webm|mov)$/i.test(f.filename)) ?? files[0]
        if (!pick) throw new Error('ComfyUI закончил генерацию без файла результата')
        const qs = new URLSearchParams({ filename: pick.filename, subfolder: pick.subfolder ?? '', type: pick.type ?? 'output' })
        const res = await fetch(`${base()}/view?${qs}`, { signal })
        if (!res.ok) throw new Error(`Не удалось скачать результат из ComfyUI (${res.status})`)
        const ext = (/\.[a-z0-9]+$/i.exec(pick.filename)?.[0] ?? '.png').toLowerCase()
        const what = Object.values(graph).find((n) => typeof n.inputs?.filename_prefix === 'string')?.inputs.filename_prefix as string | undefined
        record({
          service: 'comfyui',
          model: what?.split('/').pop() ?? null,
          kind: /\.(mp4|webm|mov)$/i.test(pick.filename) ? 'video' : /\.(mp3|wav|flac|ogg|m4a)$/i.test(pick.filename) ? 'music' : 'image',
          amount: (Date.now() - (runningSince ?? started)) / 1000,
          unit: 'seconds',
          costUsd: 0
        })
        return { bytes: Buffer.from(await res.arrayBuffer()), ext, promptId: id }
      }
      // The request waits behind other jobs until it shows up as running.
      if (runningSince == null) {
        const q = await call<{ queue_running?: unknown[][] }>('/queue', undefined, signal).catch(() => ({ queue_running: [] }))
        if (q.queue_running?.some((row) => row[1] === id)) runningSince = Date.now()
      }
      onProgress(runningSince == null, runningSince == null ? 0 : Date.now() - runningSince)
      await sleep(2000, signal)
    }
    throw new Error('ComfyUI не успел за отведённое время. Генерация, возможно, ещё идёт на сервере.')
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
