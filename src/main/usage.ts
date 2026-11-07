import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { UsageLine, UsagePeriod, UsageReport, UsageTotals } from '@shared/types'
import { getDb } from './db'

/**
 * What generation costs: every paid or metered call is written down with the video (and folder) it was made for —
 * tokens of the script writer and the voice, Higgsfield credits, Google Flow bonuses, Lyria songs, ElevenLabs
 * characters, and graphics-card time on this computer. Totals per video, per folder and overall.
 *
 * The video comes from the async context: every task runs inside its project's scope (jobs.ts), IPC calls that name
 * a project or clip get its scope (ipc.ts), so the services below only report what they spent.
 */

interface Scope {
  projectId?: string | null
  folder?: string | null
}

const scope = new AsyncLocalStorage<Scope>()

export function inScope<T>(s: Scope, fn: () => T): T {
  return scope.run({ ...scope.getStore(), ...s }, fn)
}

export interface Spend {
  service: 'gemini' | 'openrouter' | 'groq' | 'custom' | 'ollama' | 'elevenlabs' | 'higgsfield' | 'flow' | 'gemini-web' | 'comfyui' | 'chatgpt'
  model?: string | null
  kind: 'llm' | 'tts' | 'image' | 'video' | 'music' | 'vision' | 'gpu'
  inputTokens?: number
  outputTokens?: number
  /** Amount in the service's own unit (credits, bonuses, characters, seconds, songs). */
  amount?: number
  unit?: 'credits' | 'bonuses' | 'chars' | 'seconds' | 'songs' | 'requests' | null
  costUsd?: number | null
  /** The amount is an estimate (Flow bonuses when Flow does not say). */
  approx?: boolean
}

/** Writes one spend down; never fails the generation that reported it. */
export function record(s: Spend): void {
  try {
    const sc = scope.getStore() ?? {}
    const folder =
      sc.folder ??
      (sc.projectId ? ((getDb().prepare('SELECT folder FROM projects WHERE id = ?').get(sc.projectId) as { folder?: string } | undefined)?.folder ?? '') : '')
    getDb()
      .prepare(
        `INSERT INTO usage (id, project_id, folder, at, service, model, kind, input_tokens, output_tokens, amount, unit, cost_usd, approx)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        sc.projectId ?? null,
        folder,
        Date.now(),
        s.service,
        s.model ?? null,
        s.kind,
        Math.round(s.inputTokens ?? 0),
        Math.round(s.outputTokens ?? 0),
        s.amount ?? 0,
        s.unit ?? null,
        s.costUsd ?? null,
        s.approx ? 1 : 0
      )
  } catch (e) {
    console.warn('usage not recorded:', (e as Error).message)
  }
}

const since = (p: UsagePeriod): number => {
  if (p === 'all') return 0
  const d = new Date()
  if (p === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  return Date.now() - 7 * 24 * 3600 * 1000
}

interface Row {
  project_id: string | null
  folder: string | null
  service: string
  model: string | null
  kind: string
  input_tokens: number
  output_tokens: number
  amount: number
  unit: string | null
  cost_usd: number | null
  approx: number
  title: string | null
  current_folder: string | null
}

const empty = (): UsageTotals => ({ costUsd: 0, unpriced: 0, inputTokens: 0, outputTokens: 0, credits: 0, bonuses: 0, bonusesApprox: false, chars: 0, gpuSeconds: 0, songs: 0, calls: 0 })

function add(t: UsageTotals, r: Row): void {
  t.calls++
  t.inputTokens += r.input_tokens
  t.outputTokens += r.output_tokens
  if (r.cost_usd != null) t.costUsd += r.cost_usd
  else if (r.service !== 'comfyui' && r.service !== 'ollama' && r.service !== 'custom' && r.service !== 'gemini-web' && r.service !== 'chatgpt' && r.service !== 'flow' && r.unit !== 'bonuses' && r.unit !== 'chars') t.unpriced++
  if (r.unit === 'credits') t.credits += r.amount
  if (r.unit === 'bonuses') {
    t.bonuses += r.amount
    if (r.approx) t.bonusesApprox = true
  }
  if (r.unit === 'chars') t.chars += r.amount
  if (r.unit === 'seconds') t.gpuSeconds += r.amount
  if (r.unit === 'songs') t.songs += r.amount
}

const SERVICE_NAMES: Record<string, string> = {
  gemini: 'Gemini API',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  custom: 'Свой endpoint',
  ollama: 'Ollama (на этом компьютере)',
  elevenlabs: 'ElevenLabs',
  higgsfield: 'Higgsfield',
  flow: 'Google Flow',
  'gemini-web': 'Gemini в Chrome',
  comfyui: 'ComfyUI (на этом компьютере)',
  chatgpt: 'ChatGPT в Chrome'
}
const KIND_NAMES: Record<string, string> = { llm: 'текст', tts: 'озвучка', image: 'кадры', video: 'видео', music: 'музыка', vision: 'разбор видео', gpu: 'видеокарта' }

/**
 * Totals for a period: overall, per folder, per video, and per service and model inside the chosen scope
 * (a video, a folder or everything). Folders are the videos' folders now, so a moved video moves its spending.
 */
export function usageReport(period: UsagePeriod, filter?: { projectId?: string; folder?: string }): UsageReport {
  const rows = getDb()
    .prepare(
      `SELECT u.*, p.title AS title, p.folder AS current_folder FROM usage u LEFT JOIN projects p ON p.id = u.project_id WHERE u.at >= ?`
    )
    .all(since(period)) as Row[]
  const folderOf = (r: Row): string => (r.project_id && r.title != null ? (r.current_folder ?? '') : (r.folder ?? ''))
  const inFilter = (r: Row): boolean =>
    !filter || (filter.projectId ? r.project_id === filter.projectId : filter.folder != null ? folderOf(r) === filter.folder : true)

  const total = empty()
  const folders = new Map<string, UsageTotals>()
  const projects = new Map<string, { title: string; folder: string; t: UsageTotals }>()
  const lines = new Map<string, UsageLine>()
  for (const r of rows) {
    add(total, r)
    const f = folderOf(r)
    if (!folders.has(f)) folders.set(f, empty())
    add(folders.get(f)!, r)
    const pk = r.project_id ?? ''
    if (!projects.has(pk)) projects.set(pk, { title: r.project_id ? (r.title ?? 'Удалённое видео') : 'Без видео (библиотека, настройки папок)', folder: f, t: empty() })
    add(projects.get(pk)!.t, r)
    if (!inFilter(r)) continue
    const lk = `${r.service}|${r.model ?? ''}|${r.kind}`
    if (!lines.has(lk))
      lines.set(lk, { service: SERVICE_NAMES[r.service] ?? r.service, model: r.model, kind: KIND_NAMES[r.kind] ?? r.kind, totals: empty() })
    add(lines.get(lk)!.totals, r)
  }
  const scoped = filter ? [...lines.values()].reduce((t, l) => merge(t, l.totals), empty()) : total
  return {
    period,
    total,
    scoped,
    folders: [...folders.entries()].map(([name, t]) => ({ name, totals: t })).sort((a, b) => b.totals.costUsd - a.totals.costUsd),
    projects: [...projects.entries()]
      .map(([id, p]) => ({ id: id || null, title: p.title, folder: p.folder, totals: p.t }))
      .filter((p) => !filter?.folder || p.folder === filter.folder)
      .sort((a, b) => b.totals.costUsd - a.totals.costUsd || b.totals.calls - a.totals.calls),
    lines: [...lines.values()].sort((a, b) => b.totals.costUsd - a.totals.costUsd || b.totals.calls - a.totals.calls)
  }
}

function merge(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    costUsd: a.costUsd + b.costUsd,
    unpriced: a.unpriced + b.unpriced,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    credits: a.credits + b.credits,
    bonuses: a.bonuses + b.bonuses,
    bonusesApprox: a.bonusesApprox || b.bonusesApprox,
    chars: a.chars + b.chars,
    gpuSeconds: a.gpuSeconds + b.gpuSeconds,
    songs: a.songs + b.songs,
    calls: a.calls + b.calls
  }
}
