import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORTRAIT_PROMPT, SHEET_PROMPT } from '@shared/cardPrompts'
import * as comfy from './services/comfyui'
import { getSettings } from './settings'

/**
 * A character's portrait and model sheet from one photo, made locally by Qwen-Image 2.1 Edit in ComfyUI
 * (workflow image-qwen21-edit.json: the photo as the only reference, the prompt as written, an empty latent of the
 * wanted size). First a clean studio portrait (removes captions and clutter of a video frame), then the sheet from it.
 */

const WORKFLOW = 'image-qwen21-edit.json'

/** The vision model of Ollama must leave the graphics memory before Qwen-Image loads. */
export async function unloadOllama(): Promise<void> {
  const s = getSettings()
  const base = (s.customBaseUrl || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '')
  const model = s.llmModels?.custom || 'gemma3:27b'
  await fetch(`${base}/api/generate`, { method: 'POST', body: JSON.stringify({ model, keep_alive: 0 }), signal: AbortSignal.timeout(15000) }).catch(() => null)
}

export async function editImage(image: string, prompt: string, width: number, height: number, out: string, signal: AbortSignal): Promise<string> {
  const g = comfy.loadWorkflow(WORKFLOW)
  g['11'].inputs.image = await comfy.upload(image, signal)
  g['9'].inputs.prompt = prompt
  g['4'].inputs.width = width
  g['4'].inputs.height = height
  g['6'].inputs.seed = Math.floor(Math.random() * 2 ** 31)
  g['10'].inputs.filename_prefix = 'usp-stories/card'
  const r = await comfy.run(g, signal, () => {})
  writeFileSync(out, r.bytes)
  return out
}

export async function makeCard(
  photo: string,
  dir: string,
  onStep?: (m: string) => void,
  signal: AbortSignal = new AbortController().signal
): Promise<{ portrait: string; sheet: string }> {
  if (!(await comfy.health())) throw new Error('ComfyUI не запущен: карту персонажа рисует Qwen-Image 2.1 на этом компьютере.')
  await unloadOllama()
  onStep?.('Рисуем студийный портрет')
  const portrait = await editImage(photo, PORTRAIT_PROMPT, 896, 1120, join(dir, 'portrait-studio.png'), signal)
  onStep?.('Рисуем лист персонажа')
  const sheet = await editImage(portrait, SHEET_PROMPT, 1664, 928, join(dir, 'model-sheet.png'), signal)
  return { portrait, sheet }
}
