import { createHash } from 'node:crypto'
import type { Character } from '@shared/types'
import { readCache, writeCache } from './settings'
import { generateJson } from './services/llm'

/**
 * A character's acting notes (Персонаж › «Манера держаться и двигаться», «Голова, взгляд и мимика») as a short English
 * direction for the video models: they follow English best, and a long Russian description would crowd out the scene.
 * The condensed text is cached by the notes themselves, so each version is written by the language model once.
 */
export async function actingDirection(c: Pick<Character, 'name' | 'manner' | 'expression'>, signal?: AbortSignal): Promise<string> {
  const manner = c.manner.trim()
  const face = c.expression.trim()
  if (!manner && !face) return ''
  const key = `acting:${createHash('sha1').update(`${manner}\n---\n${face}`).digest('hex')}`
  const hit = readCache<string>(key)
  if (hit?.value) return hit.value
  try {
    const out = await generateJson<{ acting?: string }>({
      system: 'You write acting directions for an AI video model. English only, present tense, concrete physical behaviour, no names, no camera or scene details.',
      prompt: [
        manner && `How the person holds themselves and moves:\n${manner}`,
        face && `Head, gaze and facial expression:\n${face}`,
        'Condense this into one paragraph of at most 55 words: stance, typical gestures, gaze and how emotion shows. Keep every distinctive gesture, drop explanations.'
      ]
        .filter(Boolean)
        .join('\n\n'),
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { acting: { type: 'string' } },
        required: ['acting']
      },
      name: 'acting',
      signal
    })
    const text = (out.acting ?? '').trim()
    if (text) {
      writeCache(key, text)
      return text
    }
  } catch {
    // No language model at hand: the notes go in as written (video models read some Russian).
  }
  return [manner, face].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 500)
}

/** Acting directions for everyone in a clip, as one sentence block for its video prompt; '' when nobody has notes. */
export async function castActing(cast: Pick<Character, 'name' | 'manner' | 'expression'>[], signal?: AbortSignal): Promise<string> {
  const parts: string[] = []
  for (const c of cast) {
    const a = await actingDirection(c, signal)
    if (a) parts.push(cast.length > 1 ? `${c.name}: ${a}` : a)
  }
  return parts.length ? `Acting: ${parts.join(' ')}` : ''
}
