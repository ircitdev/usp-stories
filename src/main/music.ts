import { record } from './usage'
import { SONG_PRICES } from '@shared/pricing'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type { Asset } from '@shared/types'
import { emit } from './events'
import { assetAbsPath, binPath, dataDir } from './paths'
import { runJob } from './jobs'
import { getBundle, insertAsset, insertJob, saveEditor } from './repo'
import { getSecret } from './secrets'
import { probeDurationMs } from './services/audio'
import { packReady } from './localModels'
import * as comfy from './services/comfyui'
import * as geminiWeb from './services/geminiWeb'
import { generateMusicPrompt } from './story'

/**
 * Background music made by Google Gemini (Lyria): through the API with the Gemini key, or through gemini.google.com
 * open in the user's Chrome (the «Музыка» mode, their own subscription). The prompt is the project's music prompt
 * (Монтаж › Музыка), written first when there is none. The track becomes the project's music.
 */

export type MusicSource = 'api' | 'chrome' | 'ace-step' | 'stable-audio-3' | 'minimax-music-3'

const LOCAL_MUSIC: Record<string, { workflow: string; name: string }> = {
  'ace-step': { workflow: 'music-ace-step15.json', name: 'ACE-Step 1.5' },
  'stable-audio-3': { workflow: 'music-stable-audio3.json', name: 'Stable Audio 3' },
  'minimax-music-3': { workflow: 'music-minimax-music3.json', name: 'MiniMax Music 3' }
}

const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

/**
 * Music made on this computer by ComfyUI. ACE-Step takes the Suno-style tags (its own format) and a tempo and key
 * when the style names them; Stable Audio takes the paragraph description. Both are told to stay instrumental.
 */
async function viaComfy(source: string, mp: { description: string; style: string; exclude: string }, seconds: number, signal?: AbortSignal): Promise<{ bytes: Buffer; ext: string; model: string }> {
  const m = LOCAL_MUSIC[source]
  if (!(await packReady(source))) throw new Error(`${m.name} не установлен. Скачайте его в «Настройки › Локальные модели» или выберите другой источник.`)
  const g = comfy.loadWorkflow(m.workflow)
  const seed = Math.floor(Math.random() * 2 ** 31)
  // A little longer than the video, so the end can fade out under the last scene.
  const len = Math.min(source === 'stable-audio-3' ? 180 : source === 'minimax-music-3' ? 300 : 240, Math.max(10, Math.ceil(seconds + 3)))
  for (const node of Object.values(g)) {
    const i = node.inputs
    if (node.class_type === 'TextEncodeAceStepAudio1.5') {
      const style = mp.style.trim() || mp.description.trim()
      const bpm = /(\d{2,3})\s*bpm/i.exec(style)?.[1]
      const key = /\b([A-G][#b]?) (major|minor)\b/i.exec(style)
      i.tags = `${style}, instrumental`
      i.lyrics = '[Instrumental]'
      i.seed = seed
      i.duration = len
      if (bpm) i.bpm = Math.min(200, Math.max(60, Number(bpm)))
      if (key) {
        const k = KEYS.find((x) => x.toLowerCase() === key[1].toLowerCase())
        if (k) i.keyscale = `${k} ${/^min/i.test(key[2]) ? 'minor' : 'major'}`
      }
    }
    if (node.class_type === 'MiniMaxMusic3TextEncode') {
      // Its caption is a plain description; the seed comes from a SeedNode.
      i.caption = `${mp.description.trim() || mp.style.trim()} Instrumental, no vocals.`
      i.lyrics = '[Instrumental]'
      i.max_duration = len
    }
    if (node.class_type === 'SeedNode') i.seed = seed
    if (node.class_type === 'EmptyAceStep1.5LatentAudio' || node.class_type === 'EmptyLatentAudio') i.seconds = len
    if (node.class_type === 'KSampler') i.seed = seed
    if (node.class_type === 'CLIPTextEncode' && i.text !== '') i.text = promptOf(mp, seconds)
    if (node.class_type === 'CLIPTextEncode' && i.text === '' && mp.exclude.trim()) i.text = `vocals, singing, ${mp.exclude.trim()}`
    if (node.class_type === 'SaveAudioMP3') i.filename_prefix = `audio/usp-${source}`
  }
  const ctrl = new AbortController()
  const out = await comfy.run(g, signal ?? ctrl.signal, () => undefined, 15 * 60 * 1000)
  return { bytes: out.bytes, ext: out.ext, model: m.name }
}

function promptOf(mp: { description: string; style: string; exclude: string }, seconds: number): string {
  return [
    mp.description.trim(),
    mp.style.trim() && `Style: ${mp.style.trim()}.`,
    mp.exclude.trim() && `Avoid: ${mp.exclude.trim()}.`,
    `Instrumental only, no vocals, no lyrics. Background music for a video about ${Math.round(seconds)} seconds long, with a clear ending.`
  ]
    .filter(Boolean)
    .join(' ')
}

async function viaApi(prompt: string, seconds: number, signal?: AbortSignal): Promise<{ bytes: Buffer; ext: string; model: string }> {
  const key = getSecret('gemini')
  if (!key) throw new Error('Нет ключа Gemini: добавьте его в «Настройки › ИИ-сервисы и ключи» или выберите «Gemini в Chrome».')
  // Clip makes a ~30 s piece, Pro a full-length track.
  const model = seconds <= 32 ? 'lyria-3-clip-preview' : 'lyria-3-pro-preview'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal: signal ?? AbortSignal.timeout(300_000)
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string }
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[]
  }
  if (!res.ok) throw new Error(`Gemini (Lyria) не создал музыку: ${body.error?.message ?? res.status}`)
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) throw new Error('Gemini (Lyria) ответил без звука. Попробуйте поправить промпт музыки.')
  record({ service: 'gemini', model, kind: 'music', amount: 1, unit: 'songs', costUsd: SONG_PRICES[model] ?? null })
  const mime = part.inlineData.mimeType ?? 'audio/mpeg'
  return { bytes: Buffer.from(part.inlineData.data, 'base64'), ext: /wav/.test(mime) ? '.wav' : '.mp3', model }
}

/**
 * A short name for a new track: the music prompt's title when it is a real track name, otherwise the first style
 * tags; then what made it, and a number when the project already has a track of that name («Зимний драйв · ACE-Step 2»).
 */
function trackName(projectId: string, mp: { title: string; style: string }, model: string, source: MusicSource): string {
  const project = getBundle(projectId).project
  let base = mp.title.split(/\s+[–—-]\s+|:\s+/).pop()?.trim() ?? ''
  const junk = /music|supervision|notes|soundtrack|score|саундтрек/i
  if (!base || base.length > 28 || junk.test(base) || project.title.toLowerCase().includes(base.toLowerCase()))
    base = mp.style
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t && !/\d|bpm|vocal|instrumental/i.test(t))
      .slice(0, 2)
      .join(', ')
  base = (base || 'Музыка').replace(/^./, (c) => c.toUpperCase()).slice(0, 32)
  const by = source in LOCAL_MUSIC ? model : 'Gemini'
  const name = `${base} · ${by}`
  const taken = new Set(getBundle(projectId).assets.filter((a) => a.kind === 'music').map((a) => a.prompt))
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`
}

const SOURCE_NAME: Record<MusicSource, string> = { api: 'Gemini', chrome: 'Gemini в Chrome', 'ace-step': 'ACE-Step', 'stable-audio-3': 'Stable Audio', 'minimax-music-3': 'MiniMax Music' }

/**
 * Music as a project task: it shows in the header's task list with its steps and can be cancelled there.
 * Resolves with the new track once the task is done. Local models share ComfyUI's queue with pictures and video.
 */
export function generateMusic(projectId: string, source: MusicSource): Promise<Asset> {
  const job = insertJob({ projectId, kind: 'music', provider: source in LOCAL_MUSIC ? 'comfyui' : source === 'chrome' ? 'gemini-web' : 'gemini' })
  emit.job(job)
  return new Promise<Asset>((resolve, reject) => {
    let made: Asset | null = null
    runJob(job, source in LOCAL_MUSIC ? 'comfyui' : 'music', async (ctx) => {
      try {
        made = await makeMusic(projectId, source, ctx.signal, (m) => ctx.progress(m.p, m.text))
        resolve(made)
        return made.id
      } catch (e) {
        reject(ctx.signal.aborted ? new Error('Генерация музыки отменена') : e)
        throw e
      }
    })
  })
}

async function makeMusic(projectId: string, source: MusicSource, signal: AbortSignal, step: (m: { p: number; text: string }) => void): Promise<Asset> {
  const b = getBundle(projectId)
  const seconds = b.clips.reduce((n, c) => n + c.durationMs, 0) / 1000 || b.project.durationSec
  let mp = b.project.editor.musicPrompt ?? null
  if (!mp) {
    // Written once and kept in the project, so it can be edited and reused (Монтаж › Музыка).
    step({ p: 0.05, text: 'Пишем промпт музыки' })
    mp = await generateMusicPrompt(projectId)
    saveEditor(projectId, { ...getBundle(projectId).project.editor, musicPrompt: mp })
  }
  const prompt = promptOf(mp, seconds)
  step({ p: 0.15, text: `${SOURCE_NAME[source]} сочиняет трек${source in LOCAL_MUSIC ? ' на этом компьютере' : ''}` })
  // A rough clock for the bar: the services do not report their own progress.
  const started = Date.now()
  const expectMs = source === 'api' ? 30_000 : source === 'chrome' ? 120_000 : 90_000
  const tick = setInterval(() => {
    const t = (Date.now() - started) / expectMs
    step({ p: 0.15 + 0.75 * (1 - Math.exp(-2 * t)), text: `${SOURCE_NAME[source]} сочиняет трек${source in LOCAL_MUSIC ? ' на этом компьютере' : ''}` })
  }, 2000)
  const style = mp
  let got: { bytes: Buffer; ext: string; model: string }
  try {
    got =
      source === 'api'
        ? await viaApi(prompt, seconds, signal)
        : source === 'chrome'
          ? await (async () => {
              const r = { ...(await geminiWeb.makeMusic(prompt, signal)), model: 'gemini.google.com' }
              record({ service: 'gemini-web', model: 'lyria', kind: 'music', amount: 1, unit: 'songs', costUsd: 0 })
              return r
            })()
          : await viaComfy(source, style, seconds, signal)
  } finally {
    clearInterval(tick)
  }
  step({ p: 0.95, text: 'Сохраняем трек' })
  const local = source in LOCAL_MUSIC
  let ext = got.ext
  let bytes = got.bytes
  if (ext === '.mp4') {
    // Gemini on the web gives a video (cover picture + sound): keep the sound.
    const tmp = join(dataDir(), 'tmp', `gm-${randomUUID()}`)
    mkdirSync(tmp, { recursive: true })
    writeFileSync(join(tmp, 'in.mp4'), bytes)
    await new Promise<void>((resolve, reject) =>
      execFile(binPath(ffmpegStatic!), ['-hide_banner', '-y', '-i', join(tmp, 'in.mp4'), '-vn', '-c:a', 'copy', join(tmp, 'out.m4a')], { windowsHide: true }, (e, _o, err) =>
        e ? reject(new Error(String(err).split('\n').slice(-2).join(' '))) : resolve()
      )
    )
    bytes = readFileSync(join(tmp, 'out.m4a'))
    ext = '.m4a'
    rmSync(tmp, { recursive: true, force: true })
  }
  const rel = `music/${local ? source : 'gemini'}-${randomUUID()}${ext}`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
  const durationMs = await probeDurationMs(abs).catch(() => null)
  const asset = insertAsset({
    projectId,
    kind: 'music',
    provider: local ? 'local' : source === 'api' ? 'gemini' : 'gemini-web',
    model: got.model,
    prompt: trackName(projectId, mp, got.model, source),
    localPath: rel,
    durationMs
  })
  emit.asset(asset)
  return asset
}
