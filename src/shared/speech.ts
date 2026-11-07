/**
 * Inline vocal tags in narration, written the Gemini TTS way: English words in angle brackets, like
 * <short pause> or <chuckles>. They steer the voice and are never shown in captions.
 */
export const VOICE_TAGS = ['short pause', 'long pause', 'chuckles', 'laugh', 'sigh', 'gasp', 'whispers', 'breath']

const ANGLE = /<[^<>]{1,40}>/g
const SQUARE = /\[[^[\]]{1,40}\]/g

/** The words a listener hears: tags removed, spacing tidied. */
export function stripVoiceTags(text: string): string {
  return text.replace(ANGLE, ' ').replace(SQUARE, ' ').replace(/\s+/g, ' ').trim()
}

export function spokenWords(text: string): string[] {
  return stripVoiceTags(text).split(/\s+/).filter(Boolean)
}

/** Extra seconds the pause tags add to a line. */
export function tagPauseSec(text: string): number {
  const short = (text.match(/<short pause>/gi) ?? []).length
  const long = (text.match(/<long pause>/gi) ?? []).length
  return short * 0.4 + long * 1
}

/**
 * The same line for ElevenLabs: v3 models take tags in square brackets; older models only understand
 * <break> pauses, so other tags are dropped there.
 */
export function toElevenLabsText(text: string, model: string): string {
  if (/v3/i.test(model)) return text.replace(/<([^<>]{1,40})>/g, '[$1]')
  return text
    .replace(/<short pause>/gi, '<break time="0.4s" />')
    .replace(/<long pause>/gi, '<break time="1.0s" />')
    .replace(/<(?!break\b)[^<>]{1,40}>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
}

/** True for word tokens that are only tag syntax (e.g. "[laughs]" or parts of a <break> tag). */
export function isTagToken(word: string): boolean {
  return /[<>[\]=]|^\/$/.test(word)
}

/**
 * Pronunciation rules, one per line: "written = spoken". Applied to the text sent to a voice, never to captions.
 * A voice reads names, brands and domains literally ("telemore.ru" → "tlemor.ru", "YE’S" → "есть"),
 * so they get a spoken form here. Lines without "=" and lines starting with # are ignored.
 */
export const DEFAULT_PRONUNCIATIONS = [
  '# Как написано = как произносить',
  'telemore.ru = телемо\u0301ре точка ру',
  'ТЕЛЕМОРЕ = Телемо\u0301ре',
  'YE’S = Йес',
  "YE'S = Йес",
  'TOP FEST = Топ Фест'
].join('\n')

/** The rules text with `written = spoken` added, replacing an earlier rule for the same word. */
export function withPronunciation(rules: string, written: string, spoken: string): string {
  const key = written.trim().toLowerCase()
  const kept = rules
    .split('\n')
    .filter((l) => !(l.includes('=') && !l.trim().startsWith('#') && l.slice(0, l.indexOf('=')).trim().toLowerCase() === key))
  return [...kept.filter((l, i) => l.trim() || i < kept.length - 1), `${written.trim()} = ${spoken.trim()}`].join('\n')
}

/** The word with an acute stress mark after its vowel number `vowelAt` (letter index in the word). */
export function stressed(word: string, letterAt: number): string {
  const plain = word.replace(/\u0301/g, '')
  return plain.slice(0, letterAt + 1) + '\u0301' + plain.slice(letterAt + 1)
}

export function parsePronunciations(rules: string): [string, string][] {
  return rules
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]
    })
    .filter(([a, b]) => a && b)
    // Longer spellings first, so "telemore.ru" is replaced before a rule for "telemore".
    .sort((x, y) => y[0].length - x[0].length)
}

/** The text a voice should read: pronunciation rules applied, case-insensitively, as whole words. */
export function speakable(text: string, rules: string): string {
  let out = text
  for (const [from, to] of parsePronunciations(rules)) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'giu'), to)
  }
  return out
}
