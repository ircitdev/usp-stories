import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { getStyle } from '@shared/styles'
import type { Asset } from '@shared/types'
import { editImage, unloadOllama } from './cardgen'
import { emit } from './events'
import { splitAvoid } from './generation'
import { assetAbsPath } from './paths'
import { charactersOf, getAsset, getBundle, insertAsset, touchProject } from './repo'
import * as comfy from './services/comfyui'

/**
 * A project cover that looks like the project: Qwen-Image 2.1 (locally) builds it from the project's own pictures —
 * the main character's frame as the reference, the scenes and the visual style in the prompt. Without pictures yet,
 * Z-Image draws it from the script. Always 16:9, the shape of the project cards.
 */
export async function makeCover(projectId: string, signal: AbortSignal = new AbortController().signal): Promise<Asset> {
  if (!(await comfy.health())) throw new Error('ComfyUI не запущен: обложку рисует Qwen-Image на этом компьютере.')
  const b = getBundle(projectId)
  const style = getStyle(b.project.styleId)
  const cast = charactersOf(projectId)
  const withImage = b.clips.filter((c) => c.imageAssetId)
  // The reference: a frame with a character (their face carries the cover), else the first frame.
  const hero = withImage.find((c) => c.characterIds.length) ?? withImage[0] ?? null
  const scenes = b.clips
    .map((c) => splitAvoid(c.visualPrompt).scene)
    .filter(Boolean)
    .map((s) => s.replace(/^Setting:\s*/i, '').split(/\n/)[0])
  const backdrop = scenes.find((_, i) => b.clips[i] !== hero) ?? scenes[0] ?? b.project.synopsis
  const who = hero?.characterIds.length ? cast.find((c) => hero.characterIds.includes(c.id))?.name : null
  const prompt = [
    `Create an eye-catching horizontal 16:9 cover image for a short video called "${b.project.title}".`,
    hero
      ? `${who ? `${who}, the person from the reference image,` : 'The main subject of the reference image'} is the hero in the foreground, keeping the face, hair and outfit exactly, confident and engaging, looking at the viewer.`
      : '',
    `Background: ${backdrop}.`,
    `Visual style: ${style.prompt.split('.').slice(0, 2).join('.')}.`,
    'Bold composition with clear depth, dramatic light, rich colour, room on one side for a title. No text, no letters, no logos, no watermarks.'
  ]
    .filter(Boolean)
    .join(' ')
  await unloadOllama()
  const rel = `images/cover-${randomUUID()}.png`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  const heroImage = hero ? getAsset(hero.imageAssetId) : null
  if (heroImage) {
    await editImage(assetAbsPath(projectId, heroImage.localPath), prompt, 1344, 768, abs, signal)
  } else {
    const g = comfy.loadWorkflow('image-z-image-turbo.json')
    g['5'].inputs.text = prompt
    g['7'].inputs.width = 1344
    g['7'].inputs.height = 768
    g['8'].inputs.seed = Math.floor(Math.random() * 2 ** 31)
    g['10'].inputs.filename_prefix = 'usp-stories/cover'
    const r = await comfy.run(g, signal, () => {})
    writeFileSync(abs, r.bytes)
  }
  const asset = insertAsset({ projectId, kind: 'image', provider: 'comfyui', model: 'local/qwen-image-2.1', prompt, localPath: rel, width: 1344, height: 768 })
  emit.asset(asset)
  touchProject(projectId, { coverAssetId: asset.id })
  return asset
}
