import * as chatgpt from './services/chatgpt'
import { MODEL_PACKS, PACK_OF_MODEL } from '@shared/localModels'
import { packReady } from './localModels'
import { record } from './usage'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { estimateWordTimings } from '@shared/captions'
import { speakable, stripVoiceTags } from '@shared/speech'
import { CHATGPT_IMAGE_MODEL, FLOW_IMAGE_MODEL, NO_MUSIC, TALKING_HEAD_MODEL, isFlowModel, fitDuration, getImageModel, getVideoModel, imageBody, isLocalModel, maxRefs, promptLimit, videoBody, type HfModel } from '@shared/higgsfield'
import { getStyle } from '@shared/styles'
import type { AspectRatio, Asset, Character, Clip, CreditEstimate, Job, Project, WordTiming } from '@shared/types'
import { getDb } from './db'
import { emit } from './events'
import { runJob, type TaskCtx } from './jobs'
import { assetAbsPath, binPath, dataDir } from './paths'
import {
  activeJobFor,
  charactersOf,
  clipsOf,
  getAsset,
  getCharacter,
  getClip,
  getJob,
  getProject,
  insertAsset,
  insertJob,
  patchClip,
  setCharacterSheet,
  touchProject,
  unfinishedJobs,
  updateAssetMeta,
  updateJob
} from './repo'
import { dropCache, getSettings, readCache, writeCache } from './settings'
import { probeDurationMs, probeSize } from './services/audio'
import * as comfy from './services/comfyui'
import * as eleven from './services/elevenlabs'
import * as gemini from './services/gemini'
import * as hf from './services/higgsfield'
import { downloadTo, sleep } from './services/http'
import * as voicestudio from './services/voicestudio'
import { castActing } from './acting'
import * as flow from './services/flow'
import { basePromptFor } from './basePrompt'

const DAY = 24 * 60 * 60 * 1000

function extFromType(contentType: string, url: string, fallback: string): string {
  if (/png/.test(contentType)) return '.png'
  if (/jpe?g/.test(contentType)) return '.jpg'
  if (/webp/.test(contentType)) return '.webp'
  if (/mp4/.test(contentType)) return '.mp4'
  const m = /\.(png|jpe?g|webp|mp4|mov)(\?|$)/i.exec(url)
  return m ? `.${m[1].toLowerCase()}` : fallback
}

function saveFile(projectId: string, folder: string, ext: string, bytes: Buffer): string {
  const rel = `${folder}/${randomUUID()}${ext}`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
  return rel
}

/** A URL Higgsfield can fetch for a stored asset: its own recent result URL, or a fresh upload. */
async function publicUrlFor(asset: Asset, signal: AbortSignal): Promise<string> {
  if (asset.remoteUrl && asset.provider === 'higgsfield' && Date.now() - asset.createdAt < 6 * DAY) return asset.remoteUrl
  const up = asset.meta.uploadedUrl as string | undefined
  const at = asset.meta.uploadedAt as number | undefined
  if (up && at && Date.now() - at < 0.5 * DAY) return up
  const url = await hf.uploadFile(assetAbsPath(asset.projectId, asset.localPath), signal)
  updateAssetMeta(asset.id, { ...asset.meta, uploadedUrl: url, uploadedAt: Date.now() })
  return url
}

function imageProgress(ctx: TaskCtx, what: string) {
  return (status: hf.HfStatus, elapsed: number): void => {
    if (status === 'queued') ctx.progress(0.12, 'В очереди Higgsfield')
    else ctx.progress(0.15 + 0.75 * (1 - Math.exp(-elapsed / 45_000)), what)
  }
}

// ---------- prompts ----------

function characterLine(c: Character): string {
  return `${c.name}: ${c.description}`
}

/** Splits the storyboard's "Avoid:" line off the scene, so it can be phrased as a clear instruction. */
export function splitAvoid(visual: string): { scene: string; avoid: string } {
  const lines = visual.split('\n')
  const i = lines.findIndex((l) => /^\s*avoid\s*:/i.test(l))
  if (i < 0) return { scene: visual.trim(), avoid: '' }
  const avoid = lines[i].replace(/^\s*avoid\s*:\s*/i, '').replace(/\.$/, '').trim()
  lines.splice(i, 1)
  return { scene: lines.join('\n').trim(), avoid }
}

/**
 * The image prompt for a clip. The scene comes first so the model gets the content right, then who the
 * characters are, then the art style. Clothing follows the scene's Wardrobe line when it has one, so a
 * character can change out of the outfit on their reference sheet (no spacesuit indoors).
 */
function clipPrompt(project: Project, clip: Clip, chars: Character[], refNames: string[], limit: number): string {
  const style = getStyle(project.styleId)
  const { scene, avoid } = splitAvoid(clip.visualPrompt)
  const wardrobe = /^\s*wardrobe\s*:/im.test(scene)
  // The art style leads: image models give the most weight to the start of a prompt.
  const parts = [`Art style: ${style.prompt}`, `Scene (one single moment, one image — never a collage, grid, split screen or montage):\n${scene}`]
  if (chars.length)
    parts.push(
      `Recurring characters in this scene. Keep each one's body, face, hair and skin exactly as described${refNames.length ? ' and as on their reference sheet' : ''}.` +
        (wardrobe
          ? ' Their clothing follows the Wardrobe line of the scene: the default outfit only where it says so, otherwise the custom outfit.'
          : ' They wear their default outfit.') +
        `\n${chars.map(characterLine).join('\n')}`
    )
  if (refNames.length)
    parts.push(
      `Reference images are character sheets, in this order: ${refNames.join(', ')}. Use them for each character's identity, proportions and colors. ` +
        (wardrobe ? 'Copy the costume from a sheet only for characters whose Wardrobe line says "default outfit". ' : 'Match the costume to the sheet. ') +
        'Do not copy the sheet layout, poses or plain background.'
    )
  const base = basePromptFor(project.id)
  // The brand's look gives the setting and the people; its camera and «realistic» words must not override the style.
  if (base?.visual) parts.push(`Setting and people of the brand, drawn in the art style above (ignore any photo or camera wording here): ${base.visual}`)
  parts.push(`Render strictly as: ${style.prompt}`)
  if (avoid) parts.push(`Must not appear in the image: ${avoid}.`)
  parts.push(`Frame format ${project.aspectRatio}, full-bleed composition.`)
  const full = parts.join('\n\n')
  if (full.length <= limit) return full
  // Models with short prompt limits get the scene first, so trimming only loses style detail.
  return [scene, chars.map(characterLine).join('; '), avoid && `Must not appear: ${avoid}.`, style.prompt].filter(Boolean).join('\n\n')
}

function sheetPrompt(project: Project, c: Character): string {
  const style = getStyle(project.styleId)
  return [
    style.prompt,
    `Character reference sheet for "${c.name}": ${c.description}. The character is ${style.characterHint}.`,
    'Show the SAME character three times side by side: front view, three-quarter view and side view, full body, neutral standing pose, evenly spaced, on a plain light neutral background (this overrides any background instruction above). Consistent proportions, costume and colors in all three views.'
  ].join('\n\n')
}

// ---------- waiting for character sheets ----------

async function waitForSheets(characterIds: string[], signal: AbortSignal): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 15 * 60 * 1000) {
    const pending = characterIds.some((id) => activeJobFor({ characterId: id }, 'sheet'))
    if (!pending) return
    await sleep(2000, signal)
  }
}

async function referenceUrls(model: HfModel, chars: Character[], signal: AbortSignal): Promise<{ urls: string[]; names: string[] }> {
  const limit = maxRefs(model)
  if (limit === 0) return { urls: [], names: [] }
  await waitForSheets(
    chars.map((c) => c.id),
    signal
  )
  const urls: string[] = []
  const names: string[] = []
  for (const c of chars) {
    const fresh = getCharacter(c.id)
    const sheet = getAsset(fresh.sheetAssetId)
    if (!sheet || urls.length >= limit) continue
    urls.push(await publicUrlFor(sheet, signal))
    names.push(fresh.name)
  }
  return { urls, names }
}

// ---------- finishing a Higgsfield request (also used to resume after a restart) ----------

interface HfPayload {
  target: 'clip-image' | 'sheet' | 'clip-video'
  model: string
  prompt: string
}

async function finishHiggsfield(ctx: TaskCtx, job: Job, requestId: string, payload: HfPayload): Promise<string> {
  const isVideo = payload.target === 'clip-video'
  const result = await hf.waitForResult(
    requestId,
    imageProgress(ctx, isVideo ? 'Создаём видео' : payload.target === 'sheet' ? 'Создаём лист персонажа' : 'Создаём кадр'),
    ctx.signal,
    isVideo ? 30 * 60 * 1000 : 15 * 60 * 1000
  )
  const url = isVideo ? result.video?.url : result.images?.[0]?.url
  if (!url) throw new Error('Higgsfield закончил без файла результата')
  ctx.progress(0.93, 'Скачиваем результат')
  const { bytes, contentType } = await downloadTo(url, ctx.signal)
  const ext = extFromType(contentType, url, isVideo ? '.mp4' : '.png')
  return saveResult(job, payload, bytes, ext, { provider: 'higgsfield', remoteId: requestId, remoteUrl: url })
}

/** Stores a finished image or video and points the clip or character at it. */
async function saveResult(
  job: Job,
  payload: HfPayload,
  bytes: Buffer,
  ext: string,
  source: { provider: string; remoteId: string | null; remoteUrl: string | null }
): Promise<string> {
  const isVideo = payload.target === 'clip-video'
  const rel = saveFile(job.projectId, isVideo ? 'videos' : 'images', ext, bytes)
  const abs = assetAbsPath(job.projectId, rel)
  const size = await probeSize(abs)
  const durationMs = isVideo ? await probeDurationMs(abs).catch(() => null) : null
  const asset = insertAsset({
    projectId: job.projectId,
    clipId: job.clipId,
    characterId: job.characterId,
    kind: isVideo ? 'video' : 'image',
    provider: source.provider,
    model: payload.model,
    prompt: payload.prompt,
    remoteId: source.remoteId,
    remoteUrl: source.remoteUrl,
    localPath: rel,
    durationMs,
    width: size?.width ?? null,
    height: size?.height ?? null
  })
  emit.asset(asset)
  if (payload.target === 'sheet' && job.characterId) {
    setCharacterSheet(job.characterId, asset.id)
    emit.character({ characterId: job.characterId, patch: { sheetAssetId: asset.id } })
  } else if (payload.target === 'clip-image' && job.clipId) {
    patchClip(job.clipId, { imageAssetId: asset.id })
    emit.clip({ clipId: job.clipId, patch: { imageAssetId: asset.id } })
    const project = getProject(job.projectId)
    const first = clipsOf(job.projectId)[0]
    if (!project.coverAssetId || first?.id === job.clipId) touchProject(job.projectId, { coverAssetId: asset.id })
  } else if (payload.target === 'clip-video' && job.clipId) {
    const patch = { videoAssetId: asset.id, motionType: 'video' as const, mediaInMs: 0 }
    patchClip(job.clipId, patch)
    emit.clip({ clipId: job.clipId, patch })
  }
  touchProject(job.projectId)
  return asset.id
}

function startHiggsfield(job: Job, build: (ctx: TaskCtx) => Promise<{ endpoint: string; body: Record<string, unknown>; payload: HfPayload }>): Job {
  emit.job(job)
  return runJob(job, 'higgsfield', async (ctx) => {
    ctx.progress(0.04, 'Готовим промпт')
    const { endpoint, body, payload } = await build(ctx)
    ctx.progress(0.08, 'Отправляем в Higgsfield')
    const requestId = await hf.submit(endpoint, body, ctx.signal)
    ctx.setRemote(requestId)
    void hf.estimate(endpoint, body).then((e) =>
      record({ service: 'higgsfield', model: endpoint, kind: job.kind === 'video' ? 'video' : 'image', amount: e?.credits ?? 0, unit: 'credits', costUsd: e?.usd ?? null })
    )
    updateJobPayload(job.id, payload)
    return finishHiggsfield(ctx, job, requestId, payload)
  })
}

function updateJobPayload(jobId: string, payload: HfPayload): void {
  getDb().prepare('UPDATE jobs SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), jobId)
}

// ---------- local generation (ComfyUI on this computer) ----------

/** Workflow files in the ComfyUI workflows folder, per local model id (node numbers are those files' own). */
const LOCAL_WORKFLOWS: Record<string, string> = {
  'local/z-image-turbo': 'image-z-image-turbo.json',
  'local/qwen-image-2.1': 'image-qwen-image-2.1.json',
  'local/ltx25-i2v': 'video-ltx25-image-to-video.json',
  'local/h3-i2v': 'video-h3-image-to-video.json',
  'local/h3-ref2v': 'video-h3-reference-to-video.json',
  'local/infinitetalk': 'video-infinitetalk-i2v.json',
  'local/qwen-image-2.1-turbo': 'image-qwen21-turbo.json',
  'local/krea2-turbo': 'image-krea2-turbo.json',
  'local/fasth3-i2v': 'video-fasth3-i2v.json',
  'local/wan22-5b-i2v': 'video-wan22-5b-i2v.json'
}

/** Stills near one megapixel, sides divisible by 16. */
function stillSize(aspect: AspectRatio): [number, number] {
  return aspect === '9:16' ? [768, 1344] : [1344, 768]
}

/** Video sides divisible by 32. LTX renders at half size and doubles it inside the workflow. */
function videoSize(model: string, aspect: AspectRatio): [number, number] {
  if (model === 'local/ltx25-i2v') return aspect === '9:16' ? [352, 640] : [640, 352]
  if (model === TALKING_HEAD_MODEL) return aspect === '9:16' ? [480, 848] : [848, 480]
  if (model === 'local/wan22-5b-i2v') return aspect === '9:16' ? [704, 1280] : [1280, 704]
  return aspect === '9:16' ? [480, 832] : [832, 480]
}

/** MiniMax H3 takes 17·k+5 frames at 24 fps: 124 ≈ 5 s, 175 ≈ 7 s, 243 ≈ 10 s. */
const H3_FRAMES: Record<number, number> = { 5: 124, 7: 175, 10: 243 }

const seedFor = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) % 2_000_000_000
}

interface LocalInputs {
  prompt: string
  aspect: AspectRatio
  /** ComfyUI input-folder names: the clip image first, then character sheets (reference model only). */
  images?: string[]
  seconds?: number
  avoid?: string
  /** ComfyUI input-folder name of the voice the talking-head model lip-syncs to. */
  audio?: string
}

function localGraph(model: HfModel, x: LocalInputs): comfy.ComfyGraph {
  const g = comfy.loadWorkflow(LOCAL_WORKFLOWS[model.id])
  const seed = seedFor(x.prompt)
  const set = (node: string, input: string, value: unknown): void => {
    if (!g[node]) throw new Error(`В схеме ${LOCAL_WORKFLOWS[model.id]} нет узла ${node}`)
    g[node].inputs[input] = value
  }
  if (model.id === 'local/qwen-image-2.1-turbo') {
    const [w, h] = stillSize(x.aspect)
    set('459:452', 'prompt', x.prompt)
    if (x.avoid) set('459:452', 'negative_prompt', x.avoid)
    set('459:456', 'width', w)
    set('459:456', 'height', h)
    set('459:488', 'noise_seed', seed)
    set('461', 'filename_prefix', 'usp-stories/img')
    return g
  }
  if (model.id === 'local/krea2-turbo') {
    const [w, h] = stillSize(x.aspect)
    set('30:6', 'text', x.prompt)
    set('30:5', 'width', w)
    set('30:5', 'height', h)
    set('30:3', 'seed', seed)
    set('29', 'filename_prefix', 'usp-stories/img')
    return g
  }
  if (model.kind === 'image') {
    const [w, h] = stillSize(x.aspect)
    if (model.id === 'local/qwen-image-2.1') {
      set('5', 'prompt', x.prompt)
      if (x.avoid) set('5', 'negative_prompt', x.avoid)
    } else set('5', 'text', x.prompt)
    set('7', 'width', w)
    set('7', 'height', h)
    set('8', 'seed', seed)
    set('10', 'filename_prefix', 'usp-stories/img')
    return g
  }
  const [w, h] = videoSize(model.id, x.aspect)
  const seconds = fitDuration(model, x.seconds ?? 5) ?? 5
  const images = x.images ?? []
  if (model.id === TALKING_HEAD_MODEL) {
    if (!x.audio) throw new Error('Для говорящей головы нужен голос клипа')
    // 25 fps; the whole clip, so the lips follow the voice wherever it sits in the clip.
    const frames = Math.max(25, Math.round((x.seconds ?? 5) * 25))
    set('8', 'audio', x.audio)
    set('9', 'num_frames', frames)
    set('10', 'image', images[0])
    set('11', 'width', w)
    set('11', 'height', h)
    set('13', 'width', w)
    set('13', 'height', h)
    set('14', 'positive_prompt', x.prompt)
    set('15', 'seed', seed)
    set('18', 'filename_prefix', 'video/usp-stories/talk')
    return g
  }
  if (model.id === 'local/fasth3-i2v') {
    // The size follows the clip image (about 0.4 megapixels); the length is given in seconds.
    set('136', 'image', images[0])
    set('105:104', 'prompt', x.prompt)
    set('105:111', 'value', seconds)
    set('105:15', 'noise_seed', seed)
    set('92', 'filename_prefix', 'video/usp-stories/fasth3')
    return g
  }
  if (model.id === 'local/wan22-5b-i2v') {
    // 24 fps, 4n+1 frames.
    set('60', 'image', images[0])
    set('6', 'text', x.prompt)
    set('55', 'width', w)
    set('55', 'height', h)
    set('55', 'length', Math.round((seconds * 24) / 4) * 4 + 1)
    set('3', 'seed', seed)
    set('58', 'filename_prefix', 'video/usp-stories/wan22')
    return g
  }
  if (model.id === 'local/ltx25-i2v') {
    const frames = Math.round((seconds * 24) / 8) * 8 + 1
    set('10', 'image', images[0])
    set('20', 'text', x.prompt)
    set('30', 'width', w)
    set('30', 'height', h)
    set('30', 'length', frames)
    set('32', 'frames_number', frames)
    set('35', 'noise_seed', seed)
    set('53', 'filename_prefix', 'video/usp-stories/ltx')
    return g
  }
  set('6', 'prompt', x.prompt)
  set('6', 'width', w)
  set('6', 'height', h)
  set('6', 'length', H3_FRAMES[seconds] ?? 124)
  set('7', 'noise_seed', seed)
  set('15', 'filename_prefix', 'video/usp-stories/h3')
  set('20', 'image', images[0])
  if (model.id === 'local/h3-ref2v') {
    // One LoadImage per extra reference, wired to ref_image_1, ref_image_2, ...
    images.slice(1, model.input.max).forEach((name, i) => {
      const id = String(21 + i)
      g[id] = { class_type: 'LoadImage', inputs: { image: name } }
      g['6'].inputs[`ref_images.ref_image_${i + 1}`] = [id, 0]
    })
  }
  return g
}

function startLocal(job: Job, build: (ctx: TaskCtx) => Promise<{ graph: comfy.ComfyGraph; payload: HfPayload }>): Job {
  emit.job(job)
  return runJob(job, 'comfyui', async (ctx) => {
    ctx.progress(0.04, 'Готовим промпт')
    const { graph, payload } = await build(ctx)
    updateJobPayload(job.id, payload)
    // A model whose files are not downloaded yet: say so plainly instead of ComfyUI's validation error.
    const pack = PACK_OF_MODEL[payload.model]
    if (pack && !(await packReady(pack)))
      throw new Error(`${MODEL_PACKS.find((p) => p.id === pack)?.name ?? payload.model} не установлена. Скачайте её в «Настройки › Локальные модели» или выберите другую модель.`)
    const isVideo = payload.target === 'clip-video'
    const what = isVideo ? 'Создаём видео на этом компьютере' : payload.target === 'sheet' ? 'Создаём лист персонажа' : 'Создаём кадр на этом компьютере'
    ctx.progress(0.08, 'Отправляем в ComfyUI')
    const out = await comfy.run(graph, ctx.signal, (queued, elapsed) => {
      if (queued) ctx.progress(0.1, 'Ждём очереди в ComfyUI')
      else ctx.progress(0.12 + 0.8 * (1 - Math.exp(-elapsed / (isVideo ? 70_000 : 15_000))), what)
    })
    ctx.setRemote(out.promptId)
    ctx.progress(0.94, 'Сохраняем результат')
    return saveResult(job, payload, out.bytes, out.ext, { provider: 'comfyui', remoteId: out.promptId, remoteUrl: null })
  })
}

/**
 * The clip's voice laid out as on the timeline: silence until `voiceStartMs`, the trimmed take, silence to the end of
 * the clip. The talking-head model moves the lips to this track, so the video matches the voice the export plays.
 */
async function uploadClipVoice(clip: Clip, signal: AbortSignal): Promise<string> {
  const audio = getAsset(clip.audioAssetId)
  if (!audio) throw new Error('У клипа нет голоса. Сначала создайте озвучку, потом говорящую голову.')
  const dir = join(dataDir(), 'tmp', 'talk')
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `talk-${clip.id}-${Date.now()}.wav`)
  const end = clip.voiceOutMs != null ? `:end=${(clip.voiceOutMs / 1000).toFixed(3)}` : ''
  const delay = Math.max(0, Math.round(clip.voiceStartMs))
  await new Promise<void>((resolve, reject) =>
    execFile(
      binPath(ffmpegStatic!),
      [
        '-hide_banner', '-y', '-i', assetAbsPath(audio.projectId, audio.localPath),
        '-af', `atrim=start=${(clip.voiceInMs / 1000).toFixed(3)}${end},asetpts=PTS-STARTPTS,adelay=${delay},apad`,
        '-t', (clip.durationMs / 1000).toFixed(3), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out
      ],
      { windowsHide: true },
      (err, _o, stderr) => (err ? reject(new Error(String(stderr).trim().split('\n').pop() || err.message)) : resolve())
    )
  )
  return comfy.upload(out, signal)
}

/** Uploads a stored asset into ComfyUI's input folder. */
function uploadAsset(asset: Asset, signal: AbortSignal): Promise<string> {
  return comfy.upload(assetAbsPath(asset.projectId, asset.localPath), signal)
}

// ---------- public entry points ----------

/** `modelId` overrides the project's image model for this clip only: a local or cloud model, Google Flow or ChatGPT in Chrome. */
export function generateClipImage(clipId: string, modelId?: string | null): Job {
  const existing = activeJobFor({ clipId }, 'image')
  if (existing) return existing
  if (modelId === FLOW_IMAGE_MODEL || modelId === CHATGPT_IMAGE_MODEL) return generateBrowserImage(clipId, modelId)
  if (modelId) {
    // A model picked in the clip panel is used for this picture; the project keeps its own.
    const clip = getClip(clipId)
    const local = isLocalModel(modelId)
    const job = insertJob({ projectId: clip.projectId, clipId, kind: 'image', provider: local ? 'comfyui' : 'higgsfield' })
    const model = getImageModel(modelId)
    if (local)
      return startLocal(job, async () => {
        const fresh = getClip(clipId)
        const project = getProject(fresh.projectId)
        const chars = charactersOf(project.id).filter((c) => fresh.characterIds.includes(c.id))
        const prompt = clipPrompt(project, fresh, chars, [], promptLimit(model))
        return { graph: localGraph(model, { prompt, aspect: project.aspectRatio, avoid: splitAvoid(fresh.visualPrompt).avoid }), payload: { target: 'clip-image', model: model.id, prompt } }
      })
    return startHiggsfield(job, async (ctx) => {
      const fresh = getClip(clipId)
      const project = getProject(fresh.projectId)
      const chars = charactersOf(project.id).filter((c) => fresh.characterIds.includes(c.id))
      const refs = await referenceUrls(model, chars, ctx.signal)
      const prompt = clipPrompt(project, fresh, chars, refs.names, promptLimit(model))
      return { endpoint: model.id, body: imageBody(model, prompt, project.aspectRatio, refs.urls), payload: { target: 'clip-image', model: model.id, prompt } }
    })
  }
  const clip = getClip(clipId)
  const local = isLocalModel(getImageModel(getProject(clip.projectId).imageModel))
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'image', provider: local ? 'comfyui' : 'higgsfield' })
  if (local)
    return startLocal(job, async () => {
      const fresh = getClip(clipId)
      const project = getProject(fresh.projectId)
      const model = getImageModel(project.imageModel)
      const chars = charactersOf(project.id).filter((c) => fresh.characterIds.includes(c.id))
      const prompt = clipPrompt(project, fresh, chars, [], promptLimit(model))
      return {
        graph: localGraph(model, { prompt, aspect: project.aspectRatio, avoid: splitAvoid(fresh.visualPrompt).avoid }),
        payload: { target: 'clip-image', model: model.id, prompt }
      }
    })
  return startHiggsfield(job, async (ctx) => {
    const fresh = getClip(clipId)
    const project = getProject(fresh.projectId)
    const model = getImageModel(project.imageModel)
    const chars = charactersOf(project.id).filter((c) => fresh.characterIds.includes(c.id))
    const refs = await referenceUrls(model, chars, ctx.signal)
    const prompt = clipPrompt(project, fresh, chars, refs.names, promptLimit(model))
    return {
      endpoint: model.id,
      body: imageBody(model, prompt, project.aspectRatio, refs.urls),
      payload: { target: 'clip-image', model: model.id, prompt }
    }
  })
}

export function generateCharacterSheet(characterId: string): Job {
  const existing = activeJobFor({ characterId }, 'sheet')
  if (existing) return existing
  const c = getCharacter(characterId)
  const local = isLocalModel(getImageModel(getProject(c.projectId).imageModel))
  const job = insertJob({ projectId: c.projectId, characterId, kind: 'sheet', provider: local ? 'comfyui' : 'higgsfield' })
  if (local)
    return startLocal(job, async () => {
      const project = getProject(c.projectId)
      const model = getImageModel(project.imageModel)
      const prompt = sheetPrompt(project, getCharacter(characterId))
      return { graph: localGraph(model, { prompt, aspect: '16:9' }), payload: { target: 'sheet', model: model.id, prompt } }
    })
  return startHiggsfield(job, async () => {
    const project = getProject(c.projectId)
    const model = getImageModel(project.imageModel)
    const prompt = sheetPrompt(project, getCharacter(characterId))
    return {
      endpoint: model.id,
      body: imageBody(model, prompt, '16:9', []),
      payload: { target: 'sheet', model: model.id, prompt }
    }
  })
}

/** `modelId` overrides the project's video model for this clip only (for example a talking head for one scene). */
export function generateClipVideo(clipId: string, modelId?: string | null): Job {
  const existing = activeJobFor({ clipId }, 'video')
  if (existing) return existing
  const clip = getClip(clipId)
  const modelOf = (p: Project): HfModel => getVideoModel(modelId || p.videoModel)
  if (isFlowModel(modelOf(getProject(clip.projectId)))) {
    // A real person speaking to the camera is what Flow's filter refuses («ущерб репутации»): such a scene goes
    // straight to a talking head on this computer, made from the clip's frame and voice.
    const cast = charactersOf(clip.projectId).filter((x) => clip.characterIds.includes(x.id))
    if (realSpeaker(clip, cast)) {
      const note = `${cast[0].name} говорит в камеру — Flow такие сцены с реальными людьми отклоняет, делаем говорящую голову на этом компьютере`
      if (clip.imageAssetId) {
        fallbackNotes.set(clipId, note)
        return generateClipVideo(clipId, TALKING_HEAD_MODEL)
      }
      const img = generateClipImage(clipId)
      void startFallback(clipId, TALKING_HEAD_MODEL, note)
      return img
    }
    return generateFlowVideo(clipId)
  }
  if (!clip.imageAssetId) throw new Error('Сначала создайте кадр этого клипа, потом видео.')
  if (modelOf(getProject(clip.projectId)).id === TALKING_HEAD_MODEL && !clip.audioAssetId)
    throw new Error('У клипа нет голоса. Сначала создайте озвучку, потом говорящую голову.')
  const local = isLocalModel(modelOf(getProject(clip.projectId)))
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'video', provider: local ? 'comfyui' : 'higgsfield' })
  if (local)
    return startLocal(job, async (ctx) => {
      const fresh = getClip(clipId)
      const image = getAsset(fresh.imageAssetId)
      if (!image) throw new Error('Кадр клипа не найден')
      const project = getProject(fresh.projectId)
      const model = modelOf(project)
      const note = fallbackNotes.get(clipId)
      fallbackNotes.delete(clipId)
      ctx.progress(0.05, note ?? 'Передаём кадр в ComfyUI')
      let images = [await uploadAsset(image, ctx.signal)]
      if (model.id === TALKING_HEAD_MODEL) {
        ctx.progress(0.06, 'Передаём голос клипа')
        const audio = await uploadClipVoice(fresh, ctx.signal)
        const acting = await castActing(charactersOf(project.id).filter((x) => fresh.characterIds.includes(x.id)), ctx.signal)
        const prompt = [
          fresh.videoPrompt.trim() || 'The person speaks calmly and naturally to the camera, natural lip movements, subtle head motion.',
          acting || 'Restrained hand gestures, realistic.'
        ].join(' ')
        return {
          graph: localGraph(model, { prompt, aspect: project.aspectRatio, images, audio, seconds: fresh.durationMs / 1000 }),
          payload: { target: 'clip-video', model: model.id, prompt }
        }
      }
      let prompt =
        fresh.videoPrompt.trim() ||
        `${splitAvoid(fresh.visualPrompt).scene.replace(/\.$/, '')}. Subtle natural motion of the characters and environment. Keep the look of the first frame.`
      if (model.input.mode === 'reference') {
        const cast = charactersOf(project.id).filter((x) => fresh.characterIds.includes(x.id))
        const sheets = cast.map((c) => ({ c, sheet: getAsset(c.sheetAssetId) })).filter((x) => x.sheet)
        // A sheet loaded from disk (a real person's photo card) must win over the clip image: H3 keeps the face of its
        // first picture, and the clip image only has an invented look-alike. Then the people come first and the clip
        // image last, as the location only. Generated sheets match the clip image anyway, so it stays the first picture.
        const ownFace = sheets.some((x) => x.sheet!.provider === 'local')
        const slots = Math.max(0, model.input.max - 1)
        const people: string[] = []
        const refs: string[] = []
        for (const { c, sheet } of sheets.slice(0, slots)) {
          refs.push(await uploadAsset(sheet!, ctx.signal))
          people.push(`${c.name} is the person from <Picture ${ownFace ? refs.length : refs.length + 1}>: keep exactly their face, hair, beard and look.`)
        }
        if (ownFace) {
          images = [...refs, images[0]]
          prompt = `${people.join(' ')} The location, light, framing and style come from <Picture ${images.length}>; do not take any face from it. ${prompt}`
        } else {
          images = [images[0], ...refs]
          prompt = `Open on the exact scene of <Picture 1> and keep its composition, light and style. ${people.join(' ')} ${prompt}`
        }
      }
      // How the people in the clip stand, gesture and look (Персонаж › Манера, Голова и взгляд).
      const acting = await castActing(charactersOf(project.id).filter((x) => fresh.characterIds.includes(x.id)), ctx.signal)
      prompt = `${prompt.trim()} ${acting} ${NO_MUSIC}`.replace(/\s+/g, ' ')
      return {
        graph: localGraph(model, { prompt, aspect: project.aspectRatio, images, seconds: fresh.durationMs / 1000 }),
        payload: { target: 'clip-video', model: model.id, prompt }
      }
    })
  return startHiggsfield(job, async (ctx) => {
    const fresh = getClip(clipId)
    const image = getAsset(fresh.imageAssetId)
    if (!image) throw new Error('Картинка клипа не найдена')
    const project = getProject(fresh.projectId)
    const model = modelOf(project)
    ctx.progress(0.05, 'Готовим первый кадр')
    const url = await publicUrlFor(image, ctx.signal)
    let prompt =
      fresh.videoPrompt.trim() ||
      `${splitAvoid(fresh.visualPrompt).scene.replace(/\.$/, '')}. Subtle natural motion of the characters and environment, the camera slowly pushes in. Keep the art style of the first frame.`
    if (model.input.mode === 'reference')
      prompt = `Open on the exact scene of the reference image and keep its art style, characters and composition. ${prompt}`
    const acting = await castActing(charactersOf(project.id).filter((x) => fresh.characterIds.includes(x.id)), ctx.signal)
    if (acting) prompt = `${prompt.trim()} ${acting}`
    return {
      endpoint: model.id,
      body: videoBody(model, prompt, url, fresh.durationMs / 1000, project.aspectRatio, project.videoResolution),
      payload: { target: 'clip-video', model: model.id, prompt }
    }
  })
}

/**
 * A clip video made by Google Flow in the user's Chrome (services/flow.ts). Flow's agent gets the scene in words
 * plus the Flow characters of the people in it (Персонаж › «Персонаж в Google Flow»), so their faces come from Flow.
 */
function generateFlowVideo(clipId: string): Job {
  const clip = getClip(clipId)
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'video', provider: 'flow' })
  emit.job(job)
  return runJob(job, 'flow', async (ctx) => {
    const fresh = getClip(clipId)
    const project = getProject(fresh.projectId)
    const cast = charactersOf(project.id).filter((x) => fresh.characterIds.includes(x.id))
    const inFlow = cast.filter((c) => c.flowName.trim())
    ctx.progress(0.03, 'Готовим запрос для Flow')
    const acting = await castActing(cast, ctx.signal)
    // The picture (place, people, light) and the motion: Flow gets no clip image, so the words carry the whole scene.
    const scene = [splitAvoid(fresh.visualPrompt).scene || fresh.story, fresh.videoPrompt.trim()].filter(Boolean).join(' ') || fresh.narration
    const prompt = [
      `Сгенерируй одно видео, ${project.aspectRatio === '9:16' ? 'вертикальное 9:16' : 'горизонтальное 16:9'}.`,
      inFlow.length
        ? // @[Имя] becomes a real @-mention of the Flow character in the prompt (flow_clip.py picks it from Flow's list).
          `В кадре ${inFlow.map((c) => `@[${c.flowName.trim()}]`).join(' и ')} — сохрани ${inFlow.length > 1 ? 'их внешность' : 'внешность'} точно.`
        : '',
      `Сцена: ${scene.trim()}`,
      acting,
      basePromptFor(project.id)?.visual ? `Общий стиль видео проекта: ${basePromptFor(project.id)!.visual}` : '',
      'Без речи и диалогов — ни одного слова ни на каком языке; без музыки, только звуки окружения. Без текста, надписей и субтитров на экране.',
      'Не перемещай видео в подборки.'
    ]
      .filter(Boolean)
      .join('\n')
    let payload: HfPayload = { target: 'clip-video', model: FLOW_VIDEO_ID, prompt }
    updateJobPayload(job.id, payload)
    let step = 0.08
    const onProgress = (message: string): void => {
      step = Math.min(0.9, step + 0.02)
      ctx.progress(step, message)
    }
    let out: flow.FlowResult
    try {
      out = await flow.makeVideo(prompt, ctx.signal, onProgress)
    } catch (e) {
      if (ctx.signal.aborted || !isPolicyRefusal(e)) throw e
      // Flow's safety filter (Veo) refuses scenes that look like a deepfake of a real person or a real event. It is
      // not strict every time: one more try with the scene made plainly fictional, without names and brands.
      ctx.progress(0.5, 'Flow отказал по своим правилам — пробуем ещё раз без имён и брендов')
      const safe = safeFlowPrompt(prompt, cast)
      payload = { target: 'clip-video', model: FLOW_VIDEO_ID, prompt: safe }
      updateJobPayload(job.id, payload)
      try {
        out = await flow.makeVideo(safe, ctx.signal, onProgress)
      } catch (e2) {
        if (ctx.signal.aborted || !isPolicyRefusal(e2)) throw e2
        const why = refusalText(e2)
        const fb = flowFallback(fresh, cast)
        // The local job starts once this one has closed (only one video job per clip at a time).
        setTimeout(() => void startFallback(clipId, fb.model, `Flow отказал: «${why}». Делаем на этом компьютере — ${fb.name}`), 1500)
        throw new Error(`Google Flow отказал дважды: «${why}». Сцена ушла на ${fb.name} — на этом компьютере, без бонусов.`)
      }
    }
    ctx.progress(0.95, 'Сохраняем видео из Flow')
    // Flow's approval request names its price («… 20 бонусов»); without a number the video is counted, not priced.
    const bonuses = Number(/(\d+)\s*(бонус|кредит|credit)/i.exec(out.approvedText ?? out.approved ?? '')?.[1] ?? NaN)
    record({ service: 'flow', model: 'omni', kind: 'video', amount: Number.isFinite(bonuses) ? bonuses : 1, unit: Number.isFinite(bonuses) ? 'bonuses' : 'requests' })
    return saveResult(job, payload, out.bytes, '.mp4', { provider: 'flow', remoteId: null, remoteUrl: null })
  })
}

const REFUSAL = /ущерб|репутац|исказ|нарушает|отклонил|Нельзя создавать|policy|safety|guideline/i

function isPolicyRefusal(e: unknown): boolean {
  return REFUSAL.test((e as Error)?.message ?? String(e))
}

/** Flow's own words, without our wrapper. */
function refusalText(e: unknown): string {
  const m = (e as Error)?.message ?? String(e)
  const own = /(Нельзя[^»]*|[^:«]*(?:ущерб|нарушает)[^»]*)/i.exec(m)?.[1] ?? m
  return own.trim().split(/\. /)[0].replace(/[.\s]+$/, '').slice(0, 160)
}

/**
 * The same request with less for the filter to catch: the people stay as Flow @-mentions (their faces), but their
 * names, brand words in capitals and quoted titles go, and the scene is said to be staged fiction.
 */
function safeFlowPrompt(prompt: string, cast: Character[]): string {
  const names = cast.map((c) => c.name.trim()).filter((n) => n.length > 1)
  // Mentions (@[Имя]) are kept as they are: they carry the faces.
  const s = prompt
    .split(/(@\[[^\]]+\])/)
    .map((part) => {
      if (part.startsWith('@[')) return part
      let t = part
      for (const n of names) t = t.split(n).join('персонаж')
      return t
        .replace(/«[^»]{1,60}»/g, '')
        // Real places with dates and site addresses make a scene read as news about a real event.
        .replace(/,?\s*\b(19|20)\d{2}\b/g, '')
        .replace(/[^\n.]*\b[\w-]+\.(ru|com|рф|org|net)\b[^\n.]*\.?/gi, '')
        .replace(/(?<!\p{L})[A-ZА-ЯЁ]{4,}(?!\p{L})/gu, '')
        .replace(/[ \t]{2,}/g, ' ')
    })
    .join('')
  return `${s}\nЭто вымышленная постановочная сцена для художественного ролика: не новости, не реальное событие, без реальных брендов.`
}

/**
 * Where a scene Flow refused goes on this computer: a person speaking to the camera with their own voice becomes a
 * talking head (InfiniteTalk); a scene with known faces goes to MiniMax H3 with their cards; anything else to LTX.
 */
/** The scene shows one person talking to the camera (by its story and picture description). */
function speaksToCamera(clip: Clip): boolean {
  const text = `${clip.visualPrompt} ${clip.videoPrompt} ${clip.story}`
  return /говор|в камеру|рассказ|обращ|произнос|speak|talk|mid-sentence|(to|into|at) the (camera|lens|audience|viewer)|in front of the camera/i.test(text)
}

/** One real person (their card is from a photo, not generated) speaking with the clip's voice. */
function realSpeaker(clip: Clip, cast: Character[]): boolean {
  return cast.length === 1 && !!clip.audioAssetId && speaksToCamera(clip) && getAsset(cast[0].sheetAssetId)?.provider === 'local'
}

function flowFallback(clip: Clip, cast: Character[]): { model: string; name: string } {
  if (speaksToCamera(clip) && clip.audioAssetId && cast.length === 1) return { model: TALKING_HEAD_MODEL, name: 'говорящая голова (InfiniteTalk)' }
  if (cast.some((c) => c.sheetAssetId)) return { model: 'local/h3-ref2v', name: 'MiniMax H3 с лицами персонажей' }
  return { model: 'local/ltx25-i2v', name: 'LTX 2.5' }
}

/** Local video for a refused scene: makes the clip's frame first when it has none (Flow projects can skip frames). */
async function startFallback(clipId: string, model: string, note: string): Promise<void> {
  try {
    if (!getClip(clipId).imageAssetId) {
      const img = generateClipImage(clipId)
      for (;;) {
        await sleep(3000)
        const j = getJob(img.id)
        if (!j || j.status === 'failed' || j.status === 'canceled') return
        if (j.status === 'done' && getClip(clipId).imageAssetId) break
      }
    }
    if (model === TALKING_HEAD_MODEL && !getClip(clipId).audioAssetId) model = 'local/h3-ref2v'
    fallbackNotes.set(clipId, note)
    generateClipVideo(clipId, model)
  } catch {
    // The clip's card already shows Flow's refusal; the user can pick a model by hand.
  }
}

/** Why a clip's video is being made locally (after a Flow refusal): shown in its progress line. */
const fallbackNotes = new Map<string, string>()

const FLOW_VIDEO_ID = 'flow/veo'

/** Cuts a picture to the project's frame shape (ChatGPT draws 2:3 or 1:1), centred. */
async function cropToAspect(abs: string, aspect: AspectRatio): Promise<void> {
  const crop = aspect === '9:16' ? "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'" : "crop='min(iw,ih*16/9)':'min(ih,iw*9/16)'"
  const tmp = abs.replace(/(\.[a-z]+)$/i, '.crop$1')
  await new Promise<void>((resolve, reject) =>
    execFile(binPath(ffmpegStatic!), ['-hide_banner', '-loglevel', 'error', '-y', '-i', abs, '-vf', crop, tmp], { windowsHide: true }, (e, _o, err) =>
      e ? reject(new Error(String(err).trim().split('\n').pop() || e.message)) : resolve()
    )
  )
  renameSync(tmp, abs)
}

/**
 * A clip picture made in the user's Chrome. Google Flow's agent gets the scene with @-mentions of the Flow
 * characters (their faces come from Flow); ChatGPT gets the scene, the characters' cards as attachments and their
 * descriptions. Both draw in the project's art style; the picture is cut to the project's frame shape.
 */
function generateBrowserImage(clipId: string, modelId: string): Job {
  const clip = getClip(clipId)
  const viaFlow = modelId === FLOW_IMAGE_MODEL
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'image', provider: viaFlow ? 'flow' : 'chatgpt' })
  emit.job(job)
  return runJob(job, 'flow', async (ctx) => {
    const fresh = getClip(clipId)
    const project = getProject(fresh.projectId)
    const style = getStyle(project.styleId)
    const cast = charactersOf(project.id).filter((c) => fresh.characterIds.includes(c.id))
    const { scene, avoid } = splitAvoid(fresh.visualPrompt)
    const base = basePromptFor(project.id)
    const vertical = project.aspectRatio === '9:16'
    ctx.progress(0.03, viaFlow ? 'Готовим запрос для Flow' : 'Готовим запрос для ChatGPT')
    let prompt: string
    let files: string[] = []
    if (viaFlow) {
      const inFlow = cast.filter((c) => c.flowName.trim())
      prompt = [
        `Сгенерируй одно изображение, ${vertical ? 'вертикальное 9:16' : 'горизонтальное 16:9'}.`,
        `Стиль: ${style.prompt}`,
        inFlow.length ? `В кадре ${inFlow.map((c) => `@[${c.flowName.trim()}]`).join(' и ')} — сохрани ${inFlow.length > 1 ? 'их внешность' : 'внешность'} точно.` : '',
        `Сцена: ${scene.trim() || fresh.story}`,
        base?.visual ? `Место и люди бренда (в том же стиле): ${base.visual}` : '',
        avoid ? `Не должно быть: ${avoid}.` : '',
        'Одно изображение, не коллаж. Без текста, надписей и субтитров на изображении.',
        'Не перемещай изображение в подборки.'
      ]
        .filter(Boolean)
        .join('\n')
    } else {
      const withCards = cast.map((c) => ({ c, sheet: getAsset(c.sheetAssetId) })).filter((x) => x.sheet?.localPath)
      files = withCards.map((x) => assetAbsPath(project.id, x.sheet!.localPath!))
      prompt = [
        `Нарисуй одно изображение по описанию ниже. Формат ${vertical ? 'вертикальный 2:3' : 'горизонтальный 3:2'}. Одна сцена, не коллаж. Без текста и надписей на изображении.`,
        `Стиль изображения: ${style.prompt}`,
        cast.length
          ? `Персонажи в кадре: ${cast
              .map((c) => {
                const i = withCards.findIndex((x) => x.c.id === c.id)
                return `${c.name}${i >= 0 ? ` (приложенная карта № ${i + 1} — сохрани лицо, причёску и внешность точно)` : ''}: ${c.description}`
              })
              .join('; ')}.`
          : '',
        `Сцена: ${scene.trim() || fresh.story}`,
        base?.visual ? `Место и люди бренда (в том же стиле): ${base.visual}` : '',
        avoid ? `Не должно быть: ${avoid}.` : ''
      ]
        .filter(Boolean)
        .join('\n')
    }
    const payload: HfPayload = { target: 'clip-image', model: modelId, prompt }
    updateJobPayload(job.id, payload)
    let step = 0.08
    const onProgress = (message: string): void => {
      step = Math.min(0.9, step + 0.02)
      ctx.progress(step, message)
    }
    const got = viaFlow ? await flow.makeMedia(prompt, 'image', ctx.signal, onProgress) : await chatgpt.makeImage(prompt, files, ctx.signal, onProgress)
    record({ service: viaFlow ? 'flow' : 'chatgpt', model: viaFlow ? 'omni-image' : 'chatgpt-image', kind: 'image', amount: 1, unit: 'requests', costUsd: 0 })
    ctx.progress(0.94, 'Сохраняем картинку')
    // Cut to the frame shape before saving: a temporary file, then the usual save.
    const tmpDir = join(dataDir(), 'tmp', 'browser-image')
    mkdirSync(tmpDir, { recursive: true })
    const tmp = join(tmpDir, `${job.id}${got.ext}`)
    writeFileSync(tmp, got.bytes)
    await cropToAspect(tmp, project.aspectRatio)
    const id = await saveResult(job, payload, readFileSync(tmp), got.ext, { provider: viaFlow ? 'flow' : 'chatgpt', remoteId: null, remoteUrl: null })
    rmSync(tmp, { force: true })
    const note = 'note' in got ? got.note : null
    return note ? { message: note } : id
  })
}

/** `newTake`: a different take (another seed) — for a wrong stress or intonation in this one clip. */
export function generateClipTts(clipId: string, newTake = false): Job {
  const existing = activeJobFor({ clipId }, 'tts')
  if (existing) return existing
  const clip = getClip(clipId)
  const project = getProject(clip.projectId)
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'tts', provider: project.ttsProvider })
  emit.job(job)
  return runJob(job, 'tts', async (ctx) => {
    const fresh = getClip(clipId)
    const p = getProject(fresh.projectId)
    const text = fresh.narration.trim()
    if (!text) throw new Error('У этого клипа пустой закадровый текст')
    ctx.progress(0.2, 'Озвучиваем')
    let rel: string
    let words: WordTiming[] | undefined
    let estimated = false
    const voice = p.ttsVoice || (p.ttsProvider === 'gemini' ? 'Charon' : '')
    if (p.ttsProvider === 'voicestudio') {
      const wav = await voicestudio.speak(
        speakable(stripVoiceTags(text), getSettings().pronunciations),
        voice,
        p.language,
        ctx.signal,
        newTake ? 1 + Math.floor(Math.random() * 1_000_000) : 42
      )
      rel = saveFile(p.id, 'audio', '.wav', wav)
    } else if (p.ttsProvider === 'elevenlabs') {
      if (!voice) throw new Error('Выберите голос ElevenLabs на шаге «Идея».')
      const out = await eleven.speak(speakable(text, getSettings().pronunciations), voice, p.language, ctx.signal)
      rel = saveFile(p.id, 'audio', '.mp3', out.audio)
      words = out.words
    } else {
      const wav = await gemini.speak(speakable(text, getSettings().pronunciations), voice, p.language, ctx.signal)
      rel = saveFile(p.id, 'audio', '.wav', wav)
    }
    ctx.progress(0.85, 'Измеряем длительность')
    const audioMs = await probeDurationMs(assetAbsPath(p.id, rel))
    if (!words?.length) {
      words = estimateWordTimings(stripVoiceTags(text), audioMs / 1000)
      estimated = true
    }
    const asset = insertAsset({
      projectId: p.id,
      clipId,
      kind: 'audio',
      provider: p.ttsProvider,
      model: p.ttsProvider === 'gemini' ? getSettings().geminiTtsModel : p.ttsProvider === 'voicestudio' ? 'VoiceStudio' : getSettings().elevenModel,
      prompt: text,
      localPath: rel,
      durationMs: audioMs,
      meta: { words, estimatedTimings: estimated, voice }
    })
    emit.asset(asset)
    const durationMs = Math.max(1500, audioMs + 400)
    const patch = { audioAssetId: asset.id, durationMs, voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 }
    patchClip(clipId, patch)
    emit.clip({ clipId, patch })
    touchProject(p.id)
    return asset.id
  })
}

export function generateMissingImages(projectId: string): Job[] {
  const jobs: Job[] = []
  const project = getProject(projectId)
  const model = getImageModel(project.imageModel)
  if (maxRefs(model) > 0) {
    const needed = new Set(clipsOf(projectId).flatMap((c) => c.characterIds))
    for (const c of charactersOf(projectId)) {
      if (needed.has(c.id) && !c.sheetAssetId) jobs.push(generateCharacterSheet(c.id))
    }
  }
  for (const clip of clipsOf(projectId)) {
    if (!clip.imageAssetId) jobs.push(generateClipImage(clip.id))
  }
  return jobs
}

/** Turns every clip that has an image but no AI video yet into a video. */
export function generateMissingVideos(projectId: string): Job[] {
  const clips = clipsOf(projectId)
  if (!isFlowModel(getProject(projectId).videoModel ?? "") && clips.some((c) => !c.imageAssetId))
    throw new Error('Сначала создайте кадры всех клипов, потом видео.')
  return clips.filter((c) => !c.videoAssetId).map((c) => generateClipVideo(c.id))
}

export function generateMissingTts(projectId: string): Job[] {
  return clipsOf(projectId)
    .filter((c) => !c.audioAssetId && c.narration.trim())
    .map((c) => generateClipTts(c.id))
}

/** After a restart, keep polling Higgsfield requests that were already submitted; fail the rest. */
export function resumeJobs(): void {
  for (const row of unfinishedJobs()) {
    const payload = JSON.parse(row.payload_json || '{}') as Partial<HfPayload>
    if (row.provider === 'higgsfield' && row.remote_id && payload.target) {
      const job = getJob(row.id)!
      runJob(job, 'higgsfield', (ctx) => finishHiggsfield(ctx, job, row.remote_id, payload as HfPayload))
    } else {
      emit.job(updateJob(row.id, { status: 'failed', error: 'Остановлено: приложение было закрыто. Попробуйте ещё раз.', message: null }))
    }
  }
}

export async function setActiveAsset(clipId: string, assetId: string): Promise<void> {
  const asset = getAsset(assetId)
  if (!asset || asset.clipId !== clipId) throw new Error('Этот файл не относится к клипу')
  const patch: Partial<Clip> =
    asset.kind === 'image'
      ? { imageAssetId: asset.id }
      : asset.kind === 'video'
        ? { videoAssetId: asset.id, mediaInMs: 0 }
        : asset.kind === 'audio'
          ? { audioAssetId: asset.id, durationMs: Math.max(1500, (asset.durationMs ?? 0) + 400), voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 }
          : {}
  patchClip(clipId, patch)
  emit.clip({ clipId, patch })
}

/** Estimates that failed recently (no key, or a model the account cannot use), so pickers do not keep asking. */
const failedEstimates = new Map<string, number>()

/**
 * Credits for one image, or one clip video of about `seconds`. The model pickers ask for every model,
 * so answers are kept for a day and failures for ten minutes.
 */
export async function estimateCredits(
  kind: 'image' | 'video',
  modelId: string,
  aspect: AspectRatio,
  seconds = 5,
  resolution?: string | null
): Promise<CreditEstimate | null> {
  const model = kind === 'image' ? getImageModel(modelId) : getVideoModel(modelId)
  // Local models run on this computer and cost nothing; Google Flow spends its own credits, not Higgsfield's.
  if (isLocalModel(model) || isFlowModel(model)) return { credits: 0, usd: 0 }
  const body =
    kind === 'image'
      ? imageBody(model, 'estimate', aspect, [])
      : videoBody(model, 'estimate', 'https://example.com/frame.png', seconds, aspect, resolution)
  const key = `estimate:${model.id}:${JSON.stringify(body)}`
  const hit = readCache<CreditEstimate>(key)
  if (hit && Date.now() - hit.updatedAt < DAY) return hit.value
  const failedAt = failedEstimates.get(key)
  if (failedAt && Date.now() - failedAt < 10 * 60 * 1000) return null
  const value = await hf.estimate(model.id, body)
  if (value) writeCache(key, value)
  else failedEstimates.set(key, Date.now())
  return value
}

/** Prices can differ per account, so a new Higgsfield key starts from fresh estimates. */
export function forgetEstimates(): void {
  failedEstimates.clear()
  dropCache('estimate:')
}
