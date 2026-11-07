import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { nativeImage } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import type { LibraryCharacter, LibraryCharacterInput, VoiceSample } from '@shared/types'
import { binPath, dataDir } from './paths'
import { getSettings } from './settings'
import { recognize, whisperReady } from './whisper'

/**
 * Our own recurring characters (people and personas used across videos), kept in the shared registry
 * C:\AI\video-kit\characters.json: name, appearance, photo card or model sheet, and their VoiceStudio voice.
 * Other tools read the same file, so fields this app does not know are kept as they are.
 */

interface RegistryEntry {
  id: string
  name: string
  real_person?: boolean
  consent?: string
  role?: string
  main_image?: string | null
  model_sheet?: string | null
  images?: string[]
  appearance_prompt?: string
  /** «Манера держаться и двигаться» and «Голова, взгляд и мимика», in Russian as the user wrote them. */
  manner?: string
  expression?: string
  /** Name of this person among the characters of the Google Flow project. */
  flow_character?: string
  voice?: { engine?: string; voicestudio_name?: string; profile_id?: string; kind?: string; [k: string]: unknown } | null
  last_used?: string
  [k: string]: unknown
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** A small preview (about 320 px) as a data URL: the originals are photo cards and sheets of several megabytes. */
export function dataUrl(path: string | null | undefined): string | null {
  if (!path || !existsSync(path) || !MIME[extname(path).toLowerCase()]) return null
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  const scale = Math.min(1, 320 / Math.max(width, height))
  return (scale < 1 ? img.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' }) : img).toDataURL()
}

function registryFile(): string {
  return getSettings().charactersRegistry || 'C:/AI/video-kit/characters.json'
}

function readRaw(): { list: RegistryEntry[]; wrap: boolean } {
  const file = registryFile()
  if (!existsSync(file)) return { list: [], wrap: false }
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RegistryEntry[] | { characters: RegistryEntry[] }
  return Array.isArray(raw) ? { list: raw, wrap: false } : { list: raw.characters ?? [], wrap: true }
}

function writeRaw(list: RegistryEntry[], wrap: boolean): void {
  const file = registryFile()
  mkdirSync(dirname(file), { recursive: true })
  // The registry is shared with other tools: keep the previous version next to it before every write.
  if (existsSync(file)) copyFileSync(file, `${file}.bak`)
  const body = wrap ? { ...(JSON.parse(readFileSync(file, 'utf8')) as object), characters: list } : list
  writeFileSync(file, JSON.stringify(body, null, 2), 'utf8')
}

function toCharacter(e: RegistryEntry): LibraryCharacter {
  const main = e.main_image ?? e.images?.[0] ?? null
  const sheet = e.model_sheet && existsSync(e.model_sheet) ? e.model_sheet : main
  return {
    id: e.id,
    name: e.name,
    role: e.role ?? null,
    description: e.appearance_prompt ?? '',
    manner: e.manner ?? '',
    expression: e.expression ?? '',
    flowName: e.flow_character ?? '',
    realPerson: !!e.real_person,
    consent: e.consent ?? null,
    imagePath: main && existsSync(main) ? main : null,
    modelSheetPath: e.model_sheet && existsSync(e.model_sheet) ? e.model_sheet : null,
    sheetPath: sheet && existsSync(sheet) ? sheet : null,
    thumb: dataUrl(main ?? sheet),
    sheetThumb: e.model_sheet && existsSync(e.model_sheet) ? dataUrl(e.model_sheet) : null,
    voiceId: e.voice?.profile_id ?? null,
    voiceName: e.voice?.voicestudio_name ?? null
  }
}

export function listLibrary(): LibraryCharacter[] {
  return readRaw().list.map(toCharacter)
}

export function libraryEntry(id: string): LibraryCharacter {
  const e = listLibrary().find((x) => x.id === id)
  if (!e) throw new Error('Персонаж не найден в библиотеке')
  return e
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
}

function slug(name: string, taken: Set<string>): string {
  const base =
    [...name.toLowerCase()]
      .map((ch) => TRANSLIT[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'character'
  let id = base
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`
  return id
}

/** Copies a picked file into the character's own folder next to the registry, unless it already lives there. */
function keepFile(id: string, src: string | null | undefined, name: string): string | null {
  if (!src) return null
  if (!existsSync(src)) throw new Error(`Файл не найден: ${src}`)
  const dir = join(dirname(registryFile()), 'characters', id)
  const dst = join(dir, `${name}${extname(src).toLowerCase()}`)
  if (src.replace(/\\/g, '/').toLowerCase() === dst.replace(/\\/g, '/').toLowerCase()) return dst.replace(/\\/g, '/')
  mkdirSync(dir, { recursive: true })
  copyFileSync(src, dst)
  return dst.replace(/\\/g, '/')
}

export function saveLibraryCharacter(input: LibraryCharacterInput): LibraryCharacter[] {
  const name = input.name.trim()
  if (!name) throw new Error('Укажите имя персонажа')
  if (input.realPerson && !input.consentGiven) throw new Error('Для реального человека нужно его согласие на использование внешности и голоса.')
  const { list, wrap } = readRaw()
  const existing = input.id ? list.find((e) => e.id === input.id) : undefined
  const id = existing?.id ?? slug(name, new Set(list.map((e) => e.id)))
  const today = new Date().toISOString().slice(0, 10)
  const main = keepFile(id, input.imagePath, `${id}_portrait`)
  const sheet = keepFile(id, input.modelSheetPath, `${id}_model_sheet`)
  const entry: RegistryEntry = {
    ...(existing ?? {}),
    id,
    name,
    real_person: input.realPerson,
    consent: input.realPerson
      ? existing?.real_person && existing.consent
        ? existing.consent
        : `да — подтверждено в USP Stories ${today}`
      : 'не нужно: персонаж сгенерирован ИИ',
    role: input.role?.trim() || undefined,
    appearance_prompt: input.description.trim(),
    manner: input.manner?.trim() || undefined,
    expression: input.expression?.trim() || undefined,
    flow_character: input.flowName?.trim() || undefined,
    main_image: main,
    model_sheet: sheet,
    images: [main, sheet].filter((x): x is string => !!x),
    voice: input.voiceId
      ? { ...(existing?.voice ?? {}), engine: 'voicestudio', profile_id: input.voiceId, voicestudio_name: input.voiceName ?? existing?.voice?.voicestudio_name ?? name }
      : null,
    last_used: existing?.last_used ?? today
  }
  if (!entry.role) delete entry.role
  if (!entry.manner) delete entry.manner
  if (!entry.expression) delete entry.expression
  if (!entry.flow_character) delete entry.flow_character
  const next = existing ? list.map((e) => (e.id === id ? entry : e)) : [...list, entry]
  writeRaw(next, wrap)
  return next.map(toCharacter)
}

/** Removes the registry entry only; the character's files stay on disk. */
export function removeLibraryCharacter(id: string): LibraryCharacter[] {
  const { list, wrap } = readRaw()
  const next = list.filter((e) => e.id !== id)
  writeRaw(next, wrap)
  return next.map(toCharacter)
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) =>
      err ? reject(new Error(String(stderr).trim().split('\n').slice(-2).join(' ') || err.message)) : resolve()
    )
  )
}

/**
 * A voice sample for cloning from any audio or video file: leading silence cut, mono WAV of at most 10 seconds
 * (VoiceStudio clones best from 3–10 s of one voice), and its text from the local Whisper model when it is present.
 */
export async function prepareVoiceSample(src: string, language: string): Promise<VoiceSample> {
  const dir = join(dataDir(), 'tmp', 'voice-samples')
  mkdirSync(dir, { recursive: true })
  const wav = join(dir, `${basename(src, extname(src))}-${Date.now()}.wav`)
  await run(binPath(ffmpegStatic!), [
    '-hide_banner', '-y', '-i', src, '-vn', '-ac', '1', '-ar', '44100',
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2,loudnorm=I=-18:TP=-2', '-t', '10', '-c:a', 'pcm_s16le', wav
  ])
  let text: string | null = null
  if (whisperReady()) {
    try {
      const words = await recognize(wav, language, dir)
      text = words.map((w) => w.text.trim()).join(' ').replace(/\s+([,.!?:;])/g, '$1').trim() || null
    } catch {
      text = null
    }
  }
  return { path: wav, text, whisper: whisperReady() }
}
