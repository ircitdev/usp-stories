import { readFileSync } from 'node:fs'
import { LANGUAGES } from '@shared/models'
import type { VoiceOption } from '@shared/types'
import { getSettings } from '../settings'

/**
 * Narrator voices from VoiceStudio (OmniVoice) running on this computer: cloned and designed voice profiles,
 * synthesised locally. No key: the server only listens on localhost.
 */

function base(): string {
  return (getSettings().voiceStudioUrl || 'http://localhost:3900').trim().replace(/\/+$/, '')
}

function unreachable(): Error {
  return new Error(`VoiceStudio не отвечает по адресу ${base()}. Откройте приложение VoiceStudio и попробуйте снова.`)
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(base() + '/health', { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

interface Profile {
  id: string
  name: string
  kind?: string
  language?: string
}

export async function listVoices(): Promise<VoiceOption[]> {
  let res: Response
  try {
    res = await fetch(base() + '/profiles', { signal: AbortSignal.timeout(8000) })
  } catch {
    throw unreachable()
  }
  if (!res.ok) throw new Error(`VoiceStudio вернул ошибку ${res.status}`)
  const data = (await res.json()) as Profile[] | { profiles: Profile[] }
  const list = Array.isArray(data) ? data : data.profiles
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    description: [p.kind === 'clone' ? 'клон голоса' : p.kind === 'design' ? 'синтезированный голос' : p.kind, p.language].filter(Boolean).join(' · ')
  }))
}

/** Creates a cloned voice profile from a short sample and its exact text. Returns the new profile. */
export async function createProfile(name: string, samplePath: string, text: string, language: string): Promise<VoiceOption> {
  const form = new FormData()
  form.append('name', name)
  form.append('kind', 'clone')
  form.append('language', LANGUAGES.find((l) => l.code === language)?.english ?? 'Auto')
  form.append('ref_text', text)
  form.append('ref_audio', new Blob([readFileSync(samplePath)], { type: 'audio/wav' }), 'sample.wav')
  let res: Response
  try {
    res = await fetch(base() + '/profiles', { method: 'POST', body: form })
  } catch {
    throw unreachable()
  }
  if (!res.ok) throw new Error(`VoiceStudio не создал голос (${res.status}): ${(await res.text().catch(() => '')).slice(0, 400)}`)
  const p = (await res.json()) as Profile
  return { id: p.id, name: p.name, description: 'клон голоса' }
}

/** One WAV for the whole text; VoiceStudio splits long texts itself and joins the parts. */
/** `seed` 42 keeps takes repeatable; another seed gives another take of the same text. */
export async function speak(text: string, voice: string, language: string, signal: AbortSignal, seed = 42): Promise<Buffer> {
  if (!voice) throw new Error('Выберите голос VoiceStudio на шаге «Идея».')
  const form = new FormData()
  form.append('text', text)
  form.append('profile_id', voice)
  form.append('language', LANGUAGES.find((l) => l.code === language)?.english ?? 'Auto')
  form.append('num_step', '32')
  form.append('seed', String(seed))
  let res: Response
  try {
    res = await fetch(base() + '/generate', { method: 'POST', body: form, signal })
  } catch (e) {
    if (signal.aborted) throw e
    throw unreachable()
  }
  if (!res.ok) throw new Error(`VoiceStudio не смог озвучить текст (${res.status}): ${(await res.text().catch(() => '')).slice(0, 400)}`)
  return Buffer.from(await res.arrayBuffer())
}
