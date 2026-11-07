import { mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { BasePrompt } from '@shared/types'
import { ffmpeg, freeComfy, ollama } from './charvideo'
import { getFolder } from './folders'
import { dataDir } from './paths'
import { getProject, projectFolder } from './repo'
import { probeDurationMs } from './services/audio'
import { generateJson } from './services/llm'
import { recognize } from './whisper'

/**
 * The base prompt of a folder (project such as «Телеморе»): the common style of all its videos, in three parts —
 * a brief for the script writer (Russian), the visual look for image and video models (English) and the music
 * direction (English). Made from the brand's site or from a sample video, then edited by hand.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { brief: { type: 'string' }, visual: { type: 'string' }, music: { type: 'string' } },
  required: ['brief', 'visual', 'music']
}

const FIELDS = [
  '- "brief": на русском, 5–9 коротких строк: что это за проект или бренд и что он предлагает; для кого видео (аудитория); тон и манера речи; ' +
    'ключевые факты, которые можно упоминать (цены, даты, места — только те, что есть в источнике); чего избегать.',
  '- "visual": in English, one paragraph for image and video models: the overall look of the videos — setting and places, kind of people ' +
    '(age, clothing), colour palette, light, mood, camera and framing habits. Concrete and visual; no brand names, logos or readable text.',
  '- "music": in English, one or two sentences: genre, mood, tempo and instruments of background music that fits the brand. ' +
    'Instrumental, no real artists.'
].join('\n')

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function clean(r: Partial<BasePrompt>, source: string): BasePrompt {
  const out = { brief: str(r.brief), visual: str(r.visual), music: str(r.music), source }
  if (!out.brief && !out.visual) throw new Error('Модель не вернула базовый промпт. Попробуйте ещё раз.')
  return out
}

/** The readable text of a page: title, description and body text without scripts, styles and tags. */
function pageText(html: string): string {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? ''
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1] ?? ''
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
  return [title, desc, body].join('\n').trim().slice(0, 14000)
}

export async function basePromptFromUrl(url: string): Promise<BasePrompt> {
  const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  let html: string
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) USP-Stories' }, signal: AbortSignal.timeout(25_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    throw new Error(`Не удалось открыть ${u}: ${(e as Error).message}`)
  }
  const text = pageText(html)
  if (text.length < 200) throw new Error('На странице почти нет текста (возможно, сайт собирается скриптами). Попробуйте другую страницу или видео.')
  const r = await generateJson<Partial<BasePrompt>>({
    system:
      'You are the creative director of a video studio. From a brand site you write the base prompt that sets the common style of all short promo videos for this brand. Use only facts from the page.',
    prompt: `Страница ${u}:\n\n${text}\n\nВерни JSON:\n${FIELDS}`,
    schema: SCHEMA,
    name: 'base_prompt'
  })
  return clean(r, u)
}

export async function basePromptFromVideo(src: string, onStep?: (m: string) => void): Promise<BasePrompt> {
  const dir = join(dataDir(), 'tmp', 'base-video', `${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  try {
    const durationMs = await probeDurationMs(src).catch(() => null)
    if (!durationMs) throw new Error('Не удалось прочитать видео. Нужен файл MP4, MOV, MKV или WebM.')
    onStep?.('Берём кадры из видео')
    const frames: string[] = []
    for (let i = 0; i < 8; i++) {
      const f = join(dir, `f${i}.jpg`)
      await ffmpeg(['-ss', ((durationMs / 1000) * (0.04 + (0.92 * i) / 7)).toFixed(2), '-i', src, '-frames:v', '1', '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-q:v', '3', f])
      frames.push(f)
    }
    // What is said in the video tells the brand, audience and tone; recognition is optional.
    let speech = ''
    try {
      onStep?.('Слушаем, что говорят в видео')
      speech = (await recognize(src, 'ru', dir)).map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    } catch {
      speech = ''
    }
    onStep?.('Изучаем стиль видео')
    await freeComfy()
    const r = await ollama<Partial<BasePrompt>>(
      [
        `Это ${frames.length} кадров из рекламного или имиджевого видео${speech ? ', а ниже — что в нём говорят' : ''}. ` +
          'Напиши базовый промпт, задающий общий стиль всех коротких видео этого проекта.',
        speech ? `Речь в видео: «${speech}»` : '',
        `Верни JSON:\n${FIELDS}`,
        'Описывай только то, что видно и слышно.'
      ]
        .filter(Boolean)
        .join('\n\n'),
      SCHEMA,
      frames,
      '1m'
    )
    return clean(r, basename(src))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The base prompt a video uses: its folder's, unless the video switched it off. */
export function basePromptFor(projectId: string): BasePrompt | null {
  const folder = projectFolder(projectId)
  if (!folder || getProject(projectId).editor.useBasePrompt === false) return null
  const b = getFolder(folder).basePrompt
  return b && (b.brief.trim() || b.visual.trim() || b.music.trim()) ? b : null
}
