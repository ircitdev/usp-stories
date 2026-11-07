import catalog from './higgsfield-catalog.json'
import type { AspectRatio, ModelOption } from './types'

/**
 * Every Higgsfield endpoint that can draw a clip image or animate one, generated from docs.higgsfield.ai
 * (see higgsfield-catalog.json). Request bodies are built from each model's own JSON schema, so a new
 * model only needs a catalog entry.
 */

interface FieldSchema {
  type?: string
  enum?: (string | number)[]
  default?: unknown
  minimum?: number
  maximum?: number
  maxLength?: number
  maxItems?: number
}

export interface HfModel {
  id: string
  name: string
  family: string
  kind: 'image' | 'video'
  /** Where the clip image (video) or the character sheets (image) go in the request. */
  input: { field: string | null; mode: 'none' | 'first-frame' | 'reference'; max: number }
  required: string[]
  props: Record<string, FieldSchema>
  durations: { values: number[] } | { min: number; max: number } | null
  tags: string[]
}

const MODELS = (catalog as unknown as { models: HfModel[] }).models

/**
 * Models that run on this computer through ComfyUI (see main/services/comfyui.ts and LOCAL_WORKFLOWS in
 * main/generation.ts). They cost no credits and need no key; ids start with "local/".
 */
const LOCAL = 'Локально (ComfyUI)'
export const LOCAL_MODELS: HfModel[] = [
  { id: 'local/z-image-turbo', name: 'Z-Image Turbo', family: LOCAL, kind: 'image', input: { field: null, mode: 'none', max: 0 },
    required: [], props: { prompt: { maxLength: 3000 } }, durations: null, tags: ['Локально', 'Бесплатно', 'Быстро'] },
  { id: 'local/qwen-image-2.1', name: 'Qwen-Image 2.1', family: LOCAL, kind: 'image', input: { field: null, mode: 'none', max: 0 },
    required: [], props: { prompt: { maxLength: 3000 } }, durations: null, tags: ['Локально', 'Бесплатно', 'Надписи на русском'] },
  { id: 'local/ltx25-i2v', name: 'LTX 2.5 (из кадра)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'first-frame', max: 1 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { min: 2, max: 10 }, tags: ['Локально', 'Бесплатно'] },
  { id: 'local/h3-i2v', name: 'MiniMax H3 (из кадра)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'first-frame', max: 1 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { values: [5, 7, 10] }, tags: ['Локально', 'Бесплатно'] },
  { id: 'local/h3-ref2v', name: 'MiniMax H3 (кадр + лица персонажей)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'reference', max: 4 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { values: [5, 7, 10] }, tags: ['Локально', 'Бесплатно', 'Лицо по листу персонажа'] },
  { id: 'local/qwen-image-2.1-turbo', name: 'Qwen-Image 2.1 Turbo', family: LOCAL, kind: 'image', input: { field: null, mode: 'none', max: 0 },
    required: [], props: { prompt: { maxLength: 3000 } }, durations: null, tags: ['Локально', 'Бесплатно', 'Надписи', 'Быстро'] },
  { id: 'local/krea2-turbo', name: 'Krea-2 Turbo', family: LOCAL, kind: 'image', input: { field: null, mode: 'none', max: 0 },
    required: [], props: { prompt: { maxLength: 3000 } }, durations: null, tags: ['Локально', 'Бесплатно', 'Эстетика'] },
  { id: 'local/fasth3-i2v', name: 'FastH3 (из кадра, быстро)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'first-frame', max: 1 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { min: 2, max: 10 }, tags: ['Локально', 'Бесплатно', 'Быстро'] },
  { id: 'local/wan22-5b-i2v', name: 'Wan 2.2 5B (из кадра, лёгкая)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'first-frame', max: 1 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { min: 2, max: 5 }, tags: ['Локально', 'Бесплатно', 'Без звука'] },
  // A talking head: the clip picture (a real photo works best) speaks the clip's own voice, lips in sync.
  { id: 'local/infinitetalk', name: 'InfiniteTalk (говорящая голова по фото)', family: LOCAL, kind: 'video', input: { field: 'image', mode: 'first-frame', max: 1 },
    required: [], props: { prompt: { maxLength: 2000 } }, durations: { min: 2, max: 15 }, tags: ['Локально', 'Бесплатно', 'Говорит голосом клипа'] }
]

/** The talking-head model: it needs the clip's voice, and the face of the clip picture is kept exactly. */
export const TALKING_HEAD_MODEL = 'local/infinitetalk'

/** Pictures made in the user's Chrome: Google Flow's agent, or ChatGPT. Not in the model lists; picked per clip. */
export const FLOW_IMAGE_MODEL = 'flow/image'
export const CHATGPT_IMAGE_MODEL = 'chatgpt/image'

/** Video through Google Flow (Omni) open in the user's Chrome; it spends Flow's own credits, not Higgsfield's. */
export const FLOW_VIDEO_MODEL = 'flow/veo'
export const FLOW_MODELS: HfModel[] = [
  { id: FLOW_VIDEO_MODEL, name: 'Google Flow (Omni, через Chrome)', family: 'Google Flow', kind: 'video', input: { field: null, mode: 'none', max: 0 },
    required: [], props: { prompt: { maxLength: 4000 } }, durations: { values: [8] }, tags: ['Google Flow', 'Персонажи Flow', 'Бонусы Flow'] }
]

export function isFlowModel(m: HfModel | string): boolean {
  return (typeof m === 'string' ? m : m.id).startsWith('flow/')
}

export function isLocalModel(m: HfModel | string): boolean {
  return (typeof m === 'string' ? m : m.id).startsWith('local/')
}

export const HF_IMAGE_MODELS = [...LOCAL_MODELS, ...MODELS].filter((m) => m.kind === 'image')
export const HF_VIDEO_MODELS = [...LOCAL_MODELS, ...FLOW_MODELS, ...MODELS].filter((m) => m.kind === 'video')

export const DEFAULT_IMAGE_MODEL = 'local/z-image-turbo'
export const DEFAULT_VIDEO_MODEL = 'local/ltx25-i2v'

export function getImageModel(id: string | null | undefined): HfModel {
  return HF_IMAGE_MODELS.find((m) => m.id === id) ?? HF_IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
}

export function getVideoModel(id: string | null | undefined): HfModel {
  return HF_VIDEO_MODELS.find((m) => m.id === id) ?? HF_VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
}

/** How many character sheets an image model accepts as references. 0 means sheets are not used. */
export function maxRefs(m: HfModel): number {
  return m.kind === 'image' && m.input.mode === 'reference' ? m.input.max : 0
}

/** Longest prompt the model accepts. Endpoints without a documented limit get a conservative one. */
export function promptLimit(m: HfModel): number {
  return m.props.prompt?.maxLength ?? (m.kind === 'video' ? 2500 : 4000)
}

/** The video length to request for a clip: the shortest allowed length that covers it, or the longest. */
export function fitDuration(m: HfModel, seconds: number): number | null {
  const d = m.durations
  if (!d) return null
  const want = Math.max(1, Math.ceil(seconds))
  if ('values' in d) {
    const values = [...d.values].sort((a, b) => a - b)
    return values.find((v) => v >= want) ?? values[values.length - 1]
  }
  return Math.min(d.max, Math.max(d.min, want))
}

export function durationLabel(m: HfModel): string | null {
  const d = m.durations
  if (!d) return null
  return 'values' in d ? `${d.values.join(' / ')} с` : `${d.min}–${d.max} с`
}

function pick(s: FieldSchema | undefined, prefer: (string | number)[]): string | number | undefined {
  if (!s?.enum?.length) return undefined
  for (const p of prefer) if (s.enum.includes(p)) return p
  return (s.default as string | number | undefined) ?? s.enum[0]
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return (space > limit * 0.8 ? cut.slice(0, space) : cut).trim()
}

/**
 * The resolution sent to the model: the requested one when the model offers it, else 2K stills (enough room for
 * camera moves) and 1080p video, or the closest the model offers.
 */
function resolutionFor(m: HfModel, want?: string | null): string | number | undefined {
  if (want && m.props.resolution?.enum?.some((v) => String(v) === want)) return m.props.resolution.enum.find((v) => String(v) === want)
  return pick(m.props.resolution, m.kind === 'image' ? ['2k', '2K', '1080p', '1k'] : ['1080p', '2K', '2k', '720p'])
}

/** Resolutions a model offers, lowest first, as picker values. */
export function resolutionOptions(m: HfModel): string[] {
  const rank = (v: string): number => {
    const k = /^(\d+(?:\.\d+)?)k$/i.exec(v)
    return k ? Number(k[1]) * 1000 : parseInt(v, 10) || 0
  }
  return (m.props.resolution?.enum ?? []).map(String).sort((a, b) => rank(a) - rank(b))
}

/** The resolution a project's videos actually use with this model. */
export function effectiveResolution(m: HfModel, want?: string | null): string | null {
  const r = resolutionFor(m, want)
  return r === undefined ? null : String(r)
}

/** Fields every model shares: prompt, frame, quality, and switching off extras we never use. */
function common(m: HfModel, prompt: string, aspect: AspectRatio, resolution?: string | null): Record<string, unknown> {
  const p = m.props
  const body: Record<string, unknown> = { prompt: clip(prompt, promptLimit(m)) }
  if (p.aspect_ratio) {
    const values = p.aspect_ratio.enum
    if (!values || values.includes(aspect)) body.aspect_ratio = aspect
  }
  const res = resolutionFor(m, resolution)
  if (res !== undefined) body.resolution = res
  if (p.quality?.enum) body.quality = p.quality.enum.includes('high') ? 'high' : p.quality.enum[p.quality.enum.length - 1]
  if (p.mode?.enum) body.mode = pick(p.mode, [])
  if (p.batch_size) body.batch_size = 1
  if (p.num_images) body.num_images = 1
  // The story already describes each shot in detail, so rewriting it would drift from the storyboard.
  if (p.enhance_prompt) body.enhance_prompt = false
  if (p.prompt_extend) body.prompt_extend = false
  // Narration and music come from the editor; generated sound would be dropped anyway.
  if (p.sound?.enum?.includes('off')) body.sound = 'off'
  if (p.generate_audio) body.generate_audio = false
  return body
}

function checkRequired(m: HfModel, body: Record<string, unknown>): Record<string, unknown> {
  const missing = m.required.filter((f) => body[f] === undefined)
  if (missing.length) throw new Error(`Модели ${m.name} нужно ${missing.join(', ')}, а это приложение пока так не умеет. Выберите другую модель.`)
  return body
}

export function imageBody(m: HfModel, prompt: string, aspect: AspectRatio, refs: string[]): Record<string, unknown> {
  const body = common(m, prompt, aspect)
  const limit = maxRefs(m)
  if (limit > 0 && refs.length && m.input.field) body[m.input.field] = refs.slice(0, limit)
  return checkRequired(m, body)
}

/**
 * Said in every video prompt. Narration and music are added in the editor, but some models (Veo, Grok,
 * MiniMax, ...) make their own soundtrack and have no switch for it.
 */
export const NO_MUSIC = 'Silent clip: no background music, no soundtrack, no singing or humming.'

/** The video prompt with the no-music rule, trimmed so the rule itself never gets cut off. */
export function videoPrompt(m: HfModel, prompt: string): string {
  return `${clip(prompt.trim(), promptLimit(m) - NO_MUSIC.length - 1)} ${NO_MUSIC}`
}

export function videoBody(
  m: HfModel,
  prompt: string,
  imageUrl: string,
  seconds: number,
  aspect: AspectRatio,
  resolution?: string | null
): Record<string, unknown> {
  const body = common(m, videoPrompt(m, prompt), aspect, resolution)
  const duration = fitDuration(m, seconds)
  if (duration != null) body.duration = duration
  if (m.input.field) body[m.input.field] = m.input.mode === 'reference' ? [imageUrl] : imageUrl
  return checkRequired(m, body)
}

/** What the app will actually request from this model, in words. */
export function describeModel(m: HfModel): string {
  if (isLocalModel(m)) {
    if (m.kind === 'image') return 'на этом компьютере · без кредитов'
    return [durationLabel(m), m.input.mode === 'reference' ? 'кадр клипа + листы персонажей' : 'начинает с кадра клипа', 'без кредитов'].filter(Boolean).join(' · ')
  }
  const res = resolutionFor(m)?.toString().replace(/k$/, 'K')
  if (m.kind === 'image') {
    const refs = maxRefs(m)
    return [refs ? `с листами персонажей (до ${refs})` : 'без листов персонажей', res && `результат ${res}`].filter(Boolean).join(' · ')
  }
  // Video resolution is picked per project, next to the model.
  return [durationLabel(m), m.input.mode === 'reference' ? 'кадр клипа как референс' : 'начинает с кадра клипа'].filter(Boolean).join(' · ')
}

/** Picker rows, the default first with a "Рекомендуем" tag so first-time users have a safe choice. */
export function hfModelOptions(kind: 'image' | 'video'): ModelOption[] {
  const list = kind === 'image' ? HF_IMAGE_MODELS : HF_VIDEO_MODELS
  const recommended = kind === 'image' ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL
  return [...list.filter((m) => m.id === recommended), ...list.filter((m) => m.id !== recommended)].map((m) => ({
    id: m.id,
    name: m.name,
    family: m.family,
    description: describeModel(m),
    tags: m.id === recommended ? ['Рекомендуем', ...m.tags] : m.tags
  }))
}
