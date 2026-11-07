import type { KeyStatus, TtsProvider } from '@shared/types'

export const TTS_NAMES: Record<TtsProvider, string> = { voicestudio: 'VoiceStudio (локально)', gemini: 'Gemini TTS', elevenlabs: 'ElevenLabs' }

/**
 * Whether each narrator voice service can be used: it needs a saved key that did not fail its last check.
 * `reason` says why not, for disabled options.
 */
export function ttsReadiness(keys: KeyStatus[]): Record<TtsProvider, { ok: boolean; reason: string | null }> {
  const one = (p: 'gemini' | 'elevenlabs'): { ok: boolean; reason: string | null } => {
    const k = keys.find((x) => x.provider === p)
    const name = p === 'gemini' ? 'Gemini' : 'ElevenLabs'
    if (!k?.configured) return { ok: false, reason: `Ключ ${name} не указан` }
    if (k.lastOk === false) return { ok: false, reason: `Ключ ${name} не подходит` }
    return { ok: true, reason: null }
  }
  // VoiceStudio runs on this computer and needs no key; if it is closed, narration says so when it starts.
  return { voicestudio: { ok: true, reason: null }, gemini: one('gemini'), elevenlabs: one('elevenlabs') }
}

/** The preferred provider when it is usable, otherwise another usable one, otherwise the preferred one anyway. */
export function usableTts(preferred: TtsProvider, keys: KeyStatus[]): TtsProvider {
  const ready = ttsReadiness(keys)
  if (ready[preferred].ok) return preferred
  const other = (['voicestudio', 'gemini', 'elevenlabs'] as TtsProvider[]).find((p) => p !== preferred && ready[p].ok)
  return other ?? preferred
}
