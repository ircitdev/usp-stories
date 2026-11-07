import { record } from './usage'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type { CardMode, CharacterFromVideo } from '@shared/types'
import { makeCard } from './cardgen'
import { prepareVoiceSample } from './library'
import { binPath, dataDir } from './paths'
import { probeDurationMs, probeSize } from './services/audio'
import * as voicestudio from './services/voicestudio'
import { getSettings } from './settings'
import { whisperReady } from './whisper'

/**
 * A character from a real video of the person: frames go to the local vision model (Ollama, gemma3 by default), which
 * writes the appearance for the prompts, the manner of holding and moving, and the head, gaze and face; the best frames
 * become the portrait and a photo card (a 2×2 sheet of real frames, so the likeness is exact); the voice can be cloned
 * in VoiceStudio from the same file.
 */

const FRAMES = 12

export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(binPath(ffmpegStatic!), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) =>
      err ? reject(new Error(String(stderr).trim().split('\n').slice(-2).join(' ') || err.message)) : resolve()
    )
  )
}

const SCHEMA = {
  type: 'object',
  properties: {
    appearance: { type: 'string' },
    outfit: { type: 'string' },
    manner: { type: 'string' },
    expression: { type: 'string' },
    role: { type: 'string' },
    portrait: { type: 'integer' },
    sheet: { type: 'array', items: { type: 'integer' } }
  },
  required: ['appearance', 'outfit', 'manner', 'expression', 'role', 'portrait', 'sheet']
}

interface Analysis {
  appearance?: string
  outfit?: string
  manner?: string
  expression?: string
  role?: string
  portrait?: number
  sheet?: number[]
}

const PROMPT = (n: number, name: string): string =>
  [
    `These are ${n} frames (numbered 0 to ${n - 1} in order) from one video of a real person${name ? ` named ${name}` : ''}. Describe this person for an AI video studio.`,
    'Return JSON:',
    '- "appearance": English, for an image generator: "human man/woman", age range, build, skin tone, face, hair, facial hair, permanent traits. No clothing, no names, no style words.',
    '- "outfit": English, the clothing worn in the video, concrete (garments, colours, materials, accessories).',
    '- "manner": Russian. How the person holds themselves and moves on camera: stance towards the camera, body, where movement happens, whether they walk around. Then a line "Характерная жестикуляция:" and 4–6 bullet lines starting with "- " describing their actual typical gestures. End with one sentence on the overall energy of the gestures.',
    '- "expression": Russian. Where they look (into the lens, down, aside), head movement (nods, tilts, turns), how emotion shows (eyes, brows, smile), and the overall impression they give.',
    '- "role": Russian, a short guess of who they are by the setting (e.g. "ведущий", "врач", "блогер"), or "".',
    `- "portrait": the frame number with the clearest, sharpest front view of the face, eyes open.`,
    '- "sheet": up to 4 different frame numbers for a character card: front close-up, three-quarter or side view, a frame showing hands/gesture, and the widest frame (most of the body). Prefer sharp frames.',
    'Describe only what is visible. No speculation about identity.'
  ].join('\n')

export async function ollama<T>(content: string, schema: object, images: string[], keepAlive: number | string, signal?: AbortSignal): Promise<T> {
  const s = getSettings()
  const base = (s.customBaseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
  const model = s.llmModels?.custom || 'gemma3:27b'
  let res: Response
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        // Streamed: a long answer would otherwise hit fetch's 5-minute wait for the response headers.
        stream: true,
        keep_alive: keepAlive,
        format: schema,
        options: { temperature: 0.2, num_ctx: 16384 },
        messages: [{ role: 'user', content, ...(images.length ? { images: images.map((f) => readFileSync(f).toString('base64')) } : {}) }]
      })
    })
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause
    throw new Error(`Локальная модель не ответила (${base}): ${cause?.code ?? cause?.message ?? (e as Error).message}. Проверьте, что Ollama запущена.`)
  }
  if (!res.ok) throw new Error(`Модель ${model} не разобрала видео (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
  // Newline-delimited JSON chunks, each with a piece of the answer.
  let text = ''
  let rest = ''
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    rest += dec.decode(value, { stream: true })
    let i: number
    while ((i = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, i).trim()
      rest = rest.slice(i + 1)
      if (!line) continue
      const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean; prompt_eval_count?: number; eval_count?: number }
      if (chunk.error) throw new Error(`Модель ${model}: ${chunk.error}`)
      text += chunk.message?.content ?? ''
      if (chunk.done) record({ service: 'ollama', model, kind: images.length ? 'vision' : 'llm', inputTokens: chunk.prompt_eval_count, outputTokens: chunk.eval_count, costUsd: 0 })
    }
  }
  try {
    return JSON.parse(text || '{}') as T
  } catch {
    throw new Error(`Модель ${model} ответила не в том формате. Попробуйте ещё раз или выберите модель с поддержкой картинок (gemma3).`)
  }
}

const analyse = (frames: string[], name: string): Promise<Analysis> =>
  // Kept loaded for a minute: a Russian pass may follow; then it frees the graphics memory for ComfyUI.
  ollama<Analysis>(PROMPT(frames.length, name), SCHEMA, frames, '1m')

const hasCyrillic = (t: string): boolean => /[а-яё]/i.test(t)

/** Vision models often answer in English whatever the prompt says: each Russian field gets its own translation pass. */
async function toRussian(text: string): Promise<string> {
  if (!text || hasCyrillic(text)) return text
  const r = await ollama<{ text?: string }>(
    'Переведи на естественный русский язык описание человека для видеостудии. Сохрани структуру: строки, пункты, начинающиеся с «- », ' +
      'заголовок «Характерная жестикуляция:», если он есть. Пиши о человеке в третьем лице, без he/she. Ничего не добавляй.\n\n' + text,
    { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    [],
    '1m'
  )
  return r.text?.trim() || text
}

async function inRussian(manner: string, expression: string): Promise<{ manner: string; expression: string }> {
  return { manner: await toRussian(manner), expression: await toRussian(expression) }
}

/** Frees ComfyUI's graphics memory before the vision model loads, unless ComfyUI is busy with something. */
export async function freeComfy(): Promise<void> {
  const url = getSettings().comfyUrl || 'http://127.0.0.1:8188'
  try {
    const q = (await (await fetch(`${url}/queue`, { signal: AbortSignal.timeout(3000) })).json()) as { queue_running?: unknown[]; queue_pending?: unknown[] }
    if (q.queue_running?.length || q.queue_pending?.length) return
    await fetch(`${url}/free`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.timeout(5000) })
  } catch {
    // ComfyUI is not running: nothing to free.
  }
}

export async function characterFromVideo(
  src: string,
  opts: { name: string; cloneVoice: boolean; language: string; card?: CardMode },
  onStep?: (message: string) => void
): Promise<CharacterFromVideo> {
  const dir = join(dataDir(), 'tmp', 'char-video', `${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const durationMs = await probeDurationMs(src).catch(() => null)
  if (!durationMs) throw new Error('Не удалось прочитать видео. Нужен файл MP4, MOV, MKV или WebM.')
  // Evenly spread frames, away from the very start and end (fades, hands on the camera).
  const times = Array.from({ length: FRAMES }, (_, i) => (durationMs / 1000) * (0.04 + (0.92 * i) / (FRAMES - 1)))
  onStep?.('Берём кадры из видео')
  const small: string[] = []
  for (let i = 0; i < times.length; i++) {
    const f = join(dir, `f${i}.jpg`)
    await ffmpeg(['-ss', times[i].toFixed(2), '-i', src, '-frames:v', '1', '-vf', 'scale=896:896:force_original_aspect_ratio=decrease', '-q:v', '3', f])
    small.push(f)
  }

  onStep?.('Изучаем внешность, манеру и мимику')
  await freeComfy()
  const a = await analyse(small, opts.name)
  const ru = await inRussian((a.manner ?? '').trim(), (a.expression ?? '').trim())
  const pick = (i: unknown): number | null => (Number.isInteger(i) && (i as number) >= 0 && (i as number) < FRAMES ? (i as number) : null)
  const portraitAt = pick(a.portrait) ?? Math.floor(FRAMES / 2)
  const sheetAt = [...new Set((a.sheet ?? []).map(pick).filter((x): x is number => x !== null))].slice(0, 4)
  while (sheetAt.length < 4) {
    const next = [portraitAt, 2, FRAMES - 3, Math.floor(FRAMES / 3)].find((x) => !sheetAt.includes(x)) ?? sheetAt.length
    sheetAt.push(next)
  }

  onStep?.('Собираем портрет и карту персонажа')
  // Full-size frames for the portrait and the card.
  const full = async (i: number): Promise<string> => {
    const f = join(dir, `full${i}.png`)
    await ffmpeg(['-ss', times[i].toFixed(2), '-i', src, '-frames:v', '1', f])
    return f
  }
  const portraitPath = await full(portraitAt)
  const parts = [] as string[]
  for (const i of sheetAt) parts.push(await full(i))
  const sheetPath = join(dir, 'card.png')
  // A card of four real frames with thin light gaps: one row for a vertical video, 2×2 for a horizontal one.
  const size = await probeSize(portraitPath).catch(() => null)
  const vertical = !!size && size.height > size.width
  const cell = vertical
    ? 'scale=-2:1280,pad=iw+16:ih+16:8:8:color=0xF4F1EA'
    : 'scale=1280:-2,pad=iw+16:ih+16:8:8:color=0xF4F1EA'
  const layout = vertical ? 'hstack=inputs=4' : 'xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0'
  await ffmpeg([
    ...parts.flatMap((p) => ['-i', p]),
    '-filter_complex',
    `${parts.map((_, k) => `[${k}:v]${cell}[c${k}]`).join(';')};[c0][c1][c2][c3]${layout}[out]`,
    '-map',
    '[out]',
    '-frames:v',
    '1',
    sheetPath
  ])

  // The card: generated from the portrait frame by Qwen-Image 2.1 (clean studio portrait + model sheet), or real frames.
  let portraitOut = portraitPath
  let sheetOut = sheetPath
  let cardNote: string | null = null
  if ((opts.card ?? 'local') === 'local') {
    try {
      const made = await makeCard(portraitPath, dir, onStep)
      portraitOut = made.portrait
      sheetOut = made.sheet
    } catch (e) {
      cardNote = `Карта собрана из кадров видео: ${(e as Error).message}`
    }
  }

  let voiceId: string | null = null
  let voiceName: string | null = null
  let voiceNote: string | null = null
  if (opts.cloneVoice) {
    onStep?.('Клонируем голос')
    const sample = await prepareVoiceSample(src, opts.language)
    if (!sample.text) {
      voiceNote = whisperReady()
        ? 'В видео не нашлось речи для клона голоса.'
        : 'Голос не клонирован: для текста образца нужна модель Whisper (Настройки › Точные субтитры).'
    } else {
      const v = await voicestudio.createProfile(opts.name.trim() || 'Голос из видео', sample.path, sample.text, opts.language)
      voiceId = v.id
      voiceName = v.name
    }
  }

  const outfit = (a.outfit ?? '').trim()
  return {
    description: [(a.appearance ?? '').trim(), outfit && `Default outfit: ${outfit}`].filter(Boolean).join('. ').replace(/\.\./g, '.'),
    manner: ru.manner,
    expression: ru.expression,
    role: (a.role ?? '').trim(),
    portraitPath: portraitOut,
    sheetPath: sheetOut,
    voiceId,
    voiceName,
    voiceNote,
    cardNote
  }
}
