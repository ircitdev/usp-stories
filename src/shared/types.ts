export type ProjectStatus = 'draft' | 'script' | 'storyboard' | 'editing' | 'exported'
export type AspectRatio = '16:9' | '9:16'
export type TtsProvider = 'gemini' | 'elevenlabs' | 'voicestudio'
export type LlmProvider = 'gemini' | 'openrouter' | 'groq' | 'custom'
export type ApiProvider = 'higgsfield' | 'gemini' | 'elevenlabs' | 'openrouter' | 'groq' | 'custom'
/** Where a live model list comes from: an LLM provider, or a TTS catalog. */
export type ModelSource = LlmProvider | 'gemini-tts' | 'elevenlabs'
export type MotionType = 'camera' | 'video'
export type CameraPresetId = 'zoomin' | 'zoomout' | 'panleft' | 'panright' | 'kenburns' | 'shake' | 'static'
export type MotionStrength = 'halus' | 'sedang' | 'kuat'
export type TransitionId =
  | 'cut'
  | 'fade'
  | 'slideleft'
  | 'zoomin'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'hblur'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'smoothleft'
  | 'wipeleft'
  | 'wiperight'
  | 'circleopen'
  | 'circleclose'
  | 'pixelize'
  | 'radial'
export type CaptionStyleId = 'karaoke' | 'tebal' | 'minimal' | 'subtitle' | 'none'
/** How a caption card comes in and how the spoken word stands out. */
export type CaptionAnimId = 'none' | 'pop' | 'rise' | 'fade' | 'words' | 'bounce'
export type CaptionPosition = 'atas' | 'tengah' | 'bawah'
export type CaptionSize = 'kecil' | 'sedang' | 'besar'
/** 1 idea, 2 script, 3 storyboard, 4 editor */
export type Step = 1 | 2 | 3 | 4

/** An opening or closing video kept with a folder (project). */
export interface FolderInsert {
  id: string
  kind: 'intro' | 'outro'
  file: string
  name: string
  width: number | null
  height: number | null
  durationMs: number | null
}

/** Settings of a folder on the home screen, given to every video made in it (main/folders.ts). */
export interface FolderSettings {
  /** Library character ids added to each new video. */
  characters: string[]
  /** Caption look of the videos. */
  captions: Partial<EditorSettings>
  logos: { id: string; file: string; name: string }[]
  inserts: FolderInsert[]
  /** Default opening/closing variant per frame shape. */
  defaults: { intro916?: string; intro169?: string; outro916?: string; outro169?: string }
  /** Music tracks kept with the folder; each video of the folder gets them to choose from. */
  music?: { id: string; file: string; name: string; durationMs: number | null }[]
  /** The common style of the folder's videos, used by every video that has «Применить базовый промпт» on. */
  basePrompt?: BasePrompt
}

/** The common style of a folder (project): for the script writer, for pictures and video, for music. */
export interface BasePrompt {
  /** Russian: what the brand/project is, audience, tone of voice, facts to keep, what to avoid. */
  brief: string
  /** English: the visual look for image and video models (palette, light, setting, people, camera). */
  visual: string
  /** English: the music direction. */
  music: string
  /** Where it was made from: a site address or a video file name. */
  source?: string
}

/** A music track of a folder, from the folder itself or from one of its videos. */
export interface FolderTrack {
  id: string
  name: string
  url: string
  durationMs: number | null
  /** 'folder' — uploaded to the folder; otherwise the video it belongs to. */
  from: 'folder' | 'project'
  projectId: string | null
  projectTitle: string | null
  provider: string | null
}

export interface CaptionPreset {
  id: string
  name: string
  look: Partial<EditorSettings>
}

export interface EditorSettings {
  captionStyle: CaptionStyleId
  captionPosition: CaptionPosition
  captionSize: CaptionSize
  /** Caption size as a multiple of the style's size (0.3–1.8); overrides captionSize when set. */
  captionScale?: number
  /** Line spacing of multi-line captions as a multiple of the font's own (0.6–1.5); unset is 1. */
  captionLineHeight?: number
  /** The style to bring back when captions are switched on again. */
  captionLastStyle?: CaptionStyleId
  /** Caption animation; unset is none (the card simply appears). */
  captionAnim?: CaptionAnimId
  /** Words appear one by one as they are spoken, each with the animation; otherwise the whole card comes in. */
  captionByWord?: boolean
  /** Typewriter: the spoken word is typed letter by letter over its duration (implies word by word). */
  captionByLetter?: boolean
  /** Opening and closing videos glued to the export (assets of kind intro / outro). */
  introAssetId?: string | null
  outroAssetId?: string | null
  /** Custom look on top of the chosen caption style; unset fields keep the style's own. */
  captionFont?: string
  captionColor?: string
  captionHighlight?: string
  /** Box behind the caption: a color and opacity, or null for no box. */
  captionBg?: { color: string; opacity: number } | null
  musicAssetId: string | null
  musicVolumeDb: number
  duckMusic: boolean
  /** Logos, watermarks and text placed over the video. */
  overlays: Overlay[]
  /** Volume change for all narration, in dB. */
  voiceVolumeDb?: number
  /** Background music on the timeline: from `musicStartMs` to `musicEndMs` (null: the end), `musicInMs` into the song. */
  musicStartMs?: number
  musicEndMs?: number | null
  musicInMs?: number
  /** Last prompt written for making background music in an outside AI (Suno, Udio, …). */
  musicPrompt?: MusicPrompt | null
  /** Use the folder's base prompt (Проект › Базовый промпт) for the script, pictures, video and music; unset is on. */
  useBasePrompt?: boolean
}

export interface MusicPrompt {
  /** Suno "Style of Music": comma-separated English tags. */
  style: string
  /** Suno "Exclude styles". */
  exclude: string
  title: string
  /** One paragraph for other music AIs (Udio, ElevenLabs Music, Stable Audio, …). */
  description: string
  /** Why this music fits, in Indonesian, for the user. */
  reason: string
  /** Video length when it was written, in seconds. */
  durationSec: number
}

/**
 * Where an overlay sits: `anchor` is a numpad position on the overlay itself (7 top-left, 5 center,
 * 3 bottom-right, the same numbering as ASS n), and `x`/`y` place that point as a fraction of the frame.
 */
interface OverlayBase {
  id: string
  anchor: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  x: number
  y: number
  /** Seconds on the final timeline; `end` null means until the video ends. */
  start: number
  end: number | null
}

export interface ImageOverlay extends OverlayBase {
  kind: 'image'
  assetId: string
  /** Width as a fraction of the frame width. */
  width: number
  opacity: number
}

export type TextOverlayStyle = 'plain' | 'outline' | 'box'

export interface TextOverlay extends OverlayBase {
  kind: 'text'
  text: string
  /** Font size as a fraction of the frame height. */
  size: number
  color: string
  style: TextOverlayStyle
  bold: boolean
}

export type Overlay = ImageOverlay | TextOverlay

export interface Project {
  id: string
  title: string
  synopsis: string
  durationSec: number
  language: string
  aspectRatio: AspectRatio
  styleId: string
  ttsProvider: TtsProvider
  ttsVoice: string
  /** Higgsfield endpoint ids; null falls back to the app default. */
  imageModel: string | null
  videoModel: string | null
  /** One of the video model's resolutions, e.g. "720p"; null or unsupported uses the default (1080p when offered). */
  videoResolution: string | null
  status: ProjectStatus
  step: Step
  coverAssetId: string | null
  editor: EditorSettings
  createdAt: number
  updatedAt: number
}

export interface Character {
  id: string
  projectId: string
  name: string
  description: string
  /** «Манера держаться и двигаться»: stance, body and typical gestures; goes into every video of this character. */
  manner: string
  /** «Голова, взгляд и мимика»: gaze, head movement and how emotion shows. */
  expression: string
  /** Name of the same person among the characters of the Google Flow project (e.g. «Иван»); '' when none. */
  flowName: string
  sheetAssetId: string | null
  sort: number
}

export interface Clip {
  id: string
  projectId: string
  sort: number
  title: string
  /** What happens in the scene, in the script's language (the Naskah step). */
  story: string
  visualPrompt: string
  /** The story text the current visual plan was written from; null before any plan. */
  visualSource: string | null
  narration: string
  durationMs: number
  characterIds: string[]
  motionType: MotionType
  cameraPreset: CameraPresetId
  motionStrength: MotionStrength
  videoPrompt: string
  transition: TransitionId
  /** Camera move drawn over the AI video ('static' keeps the video as it is). */
  videoCamera: CameraPresetId
  videoStrength: MotionStrength
  /** Length of the transition into the next clip; null uses the default (0.4 s). */
  transitionMs: number | null
  /** Volume change for this clip's narration, in dB. */
  voiceGainDb: number
  /** Where the clip's video starts, in ms into the video file (trimmed from the left on the timeline). */
  mediaInMs: number
  /** The clip's voice trimmed to `voiceInMs`–`voiceOutMs` of its audio (null: to the end), placed `voiceStartMs` into the clip. */
  voiceInMs: number
  voiceOutMs: number | null
  voiceStartMs: number
  imageAssetId: string | null
  videoAssetId: string | null
  audioAssetId: string | null
}

/** intro / outro: the project's own opening and closing videos (several variants, 9:16 and 16:9). */
export type AssetKind = 'image' | 'video' | 'audio' | 'music' | 'overlay' | 'export' | 'intro' | 'outro'

export interface WordTiming {
  text: string
  start: number
  end: number
}

export interface AssetMeta {
  words?: WordTiming[]
  estimatedTimings?: boolean
  voice?: string
  [key: string]: unknown
}

export interface Asset {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: AssetKind
  provider: string | null
  model: string | null
  prompt: string | null
  remoteId: string | null
  remoteUrl: string | null
  localPath: string
  url: string
  durationMs: number | null
  width: number | null
  height: number | null
  meta: AssetMeta
  createdAt: number
}

/** "narration" voices several scenes in one take and cuts it per scene. */
export type JobKind = 'story' | 'image' | 'sheet' | 'video' | 'tts' | 'narration' | 'align' | 'export' | 'music'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface Job {
  id: string
  projectId: string
  clipId: string | null
  characterId: string | null
  kind: JobKind
  provider: string
  status: JobStatus
  progress: number
  message: string | null
  error: string | null
  resultAssetId: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectBundle {
  project: Project
  characters: Character[]
  clips: Clip[]
  assets: Asset[]
  jobs: Job[]
}

export interface ProjectSummary {
  id: string
  title: string
  styleId: string
  status: ProjectStatus
  step: Step
  clipCount: number
  totalMs: number
  coverUrl: string | null
  updatedAt: number
  /** Folder on the home screen; '' when none. */
  folder: string
}

/** What the renderer sends on save. Asset links are owned by the main process and never overwritten by a save. */
export interface ProjectSnapshot {
  project: Omit<Project, 'createdAt' | 'updatedAt' | 'coverAssetId'>
  characters: Omit<Character, 'sheetAssetId'>[]
  clips: Omit<Clip, 'imageAssetId' | 'videoAssetId' | 'audioAssetId'>[]
}

export interface NewProjectInput {
  synopsis?: string
  durationSec?: number
  language?: string
  aspectRatio?: AspectRatio
  styleId?: string
  ttsProvider?: TtsProvider
}

export interface KeyStatus {
  provider: ApiProvider
  configured: boolean
  lastOk: boolean | null
  lastMessage: string | null
  checkedAt: number | null
  /** Masked key for display, e.g. "sk-or-v1…9f3c". Null when there is no readable key. */
  preview: string | null
  /** A key is stored but can no longer be decrypted and must be entered again. */
  unreadable: boolean
}

export interface KeyTestResult {
  ok: boolean
  message: string
}

export interface VoiceOption {
  id: string
  name: string
  description: string
  previewUrl?: string | null
}

export interface AppSettings {
  defaultTtsProvider: TtsProvider
  defaultLanguage: string
  exportFolder: string | null
  /** Which LLM writes stories and narration. */
  llmProvider: LlmProvider
  /** Chosen model per LLM provider, so switching providers keeps each choice. */
  llmModels: Record<LlmProvider, string>
  /** Base URL of an OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 */
  customBaseUrl: string
  geminiTtsModel: string
  elevenModel: string
  /** Higgsfield models for new projects: the last ones picked in the Idea step. */
  imageModel: string
  videoModel: string
  /** Time captions against the real voice with Whisper after narration is made (when the model is present). */
  whisperAuto: boolean
  /** Local generation: ComfyUI server and the folder with its API-format workflows (C:\AI\ComfyUI-workflows). */
  comfyUrl: string
  comfyWorkflowsDir: string
  /** Local narrator voices: the VoiceStudio server (OmniVoice), http://localhost:3900 */
  voiceStudioUrl: string
  /** Google Flow project to make clips in (its address); '' takes the first Flow project open in Chrome. */
  flowProjectUrl: string
  /** browser-harness command that drives Chrome; '' finds it in ~/.local/bin. */
  browserHarness: string
  /** Folder of an installed faster-whisper (with .venv and models/faster-whisper-*); '' looks in C:/AI/Transcribe. */
  fasterWhisperDir: string
  /** Our recurring characters (photo cards, appearance, voices): C:\\AI\\video-kit\\characters.json */
  charactersRegistry: string
  /** "written = spoken" lines applied to narration before any voice reads it (captions keep the spelling). */
  pronunciations: string
  /** Caption look for new projects (Settings › Субтитры); unset fields keep the built-in defaults. */
  captionDefaults: Partial<EditorSettings>
  /** Saved caption looks, applied in one click in any project (Субтитры › Пресеты). */
  captionPresets: CaptionPreset[]
  /** Project folders on the home screen, including empty ones. */
  projectFolders: string[]
  /** Where projects are stored on disk; '' is the app's data folder. */
  projectsDir: string
  /** Settings of each folder (project) on the home screen, by folder name. */
  folderSettings: Record<string, FolderSettings>
  /** Caption fonts the user loaded; files live in the app's data folder (fonts). */
  customFonts: import('./captions').CaptionFont[]
}

/** A character from our own registry, ready to add to a project with its sheet and voice. */
export interface LibraryCharacter {
  id: string
  name: string
  role: string | null
  /** Appearance in English for the image prompts. */
  description: string
  manner: string
  expression: string
  flowName: string
  realPerson: boolean
  consent: string | null
  /** Portrait (main picture) on disk. */
  imagePath: string | null
  /** Full model sheet (views, expressions, outfit details) on disk, if any. */
  modelSheetPath: string | null
  /** Model sheet, else the portrait: what becomes the character's sheet in a project. */
  sheetPath: string | null
  /** Small picture for the picker (data URL). */
  thumb: string | null
  /** Small picture of the model sheet, if any. */
  sheetThumb: string | null
  /** VoiceStudio profile of this character, if any. */
  voiceId: string | null
  voiceName: string | null
}

/** What the library editor saves. Pictures are paths on disk; they are copied next to the registry. */
/** How the character card is made: generated locally by Qwen-Image 2.1, or a card of real video frames. */
export type CardMode = 'local' | 'frames'

/** A character read from a real video of the person (main/charvideo.ts). */
export interface CharacterFromVideo {
  /** English appearance with "Default outfit:", as the image prompts take it. */
  description: string
  manner: string
  expression: string
  role: string
  /** Sharpest front frame, full size. */
  portraitPath: string
  /** 2×2 card of real frames: face, angle, gesture, wide. */
  sheetPath: string
  voiceId: string | null
  voiceName: string | null
  /** Why the voice was not cloned, when it was asked for. */
  voiceNote: string | null
  /** Why the card is made of frames when a generated one was asked for. */
  cardNote: string | null
  portraitThumb?: string | null
  sheetThumb?: string | null
}

export interface LibraryCharacterInput {
  /** Missing for a new character. */
  id?: string
  name: string
  role?: string | null
  description: string
  manner?: string
  expression?: string
  flowName?: string
  realPerson: boolean
  /** A real person agreed that their face and voice are used. Required when realPerson. */
  consentGiven: boolean
  imagePath?: string | null
  modelSheetPath?: string | null
  voiceId?: string | null
  voiceName?: string | null
}

/** A short clean WAV cut from a picked file, ready to clone a voice from. */
export interface VoiceSample {
  path: string
  /** What is said in it, from the local Whisper model; null when it is not downloaded. */
  text: string | null
  whisper: boolean
}

/** Whether the local services answer right now (Settings shows it next to their addresses). */
/** One model file a local pack needs, as found in ComfyUI. */
export interface ModelFileState {
  name: string
  present: boolean
  /** Full size when known (downloadable files). */
  bytes: number | null
  /** Bytes of an unfinished download on disk. */
  partBytes: number | null
  downloadable: boolean
}

export interface ModelPackState {
  id: string
  /** ready — everything is there; missing — files or nodes are absent; downloading — a download is running. */
  state: 'ready' | 'missing' | 'downloading'
  files: ModelFileState[]
  /** ComfyUI node types the graph uses that ComfyUI does not have (a node pack is not installed). */
  missingNodes: string[]
  /** The graph file itself is not found. */
  noWorkflow: boolean
  /** Bytes left to download; 0 when nothing can be downloaded. */
  toDownload: number
  canInstall: boolean
  /** Why the last download stopped. */
  error?: string | null
}

export interface ModelInventory {
  comfy: boolean
  packs: ModelPackState[]
  ollama: { up: boolean; models: { name: string; bytes: number }[]; current: string }
  voiceStudio: boolean
  whisper: WhisperStatus
}

/** Download progress of a pack («<pack id>») or an Ollama model («ollama:<name>»). */
export interface ModelProgress {
  id: string
  file: string | null
  done: number
  total: number
  finished?: boolean
  error?: string | null
}

export type UsagePeriod = 'all' | 'month' | 'week'

/** Spending summed up: USD where the price is known, and each service's own units. */
export interface UsageTotals {
  costUsd: number
  /** Paid calls whose price is unknown (not in USD above). */
  unpriced: number
  inputTokens: number
  outputTokens: number
  credits: number
  bonuses: number
  bonusesApprox: boolean
  chars: number
  gpuSeconds: number
  songs: number
  calls: number
}

export interface UsageLine {
  service: string
  model: string | null
  kind: string
  totals: UsageTotals
}

export interface UsageReport {
  period: UsagePeriod
  total: UsageTotals
  /** Totals of the requested video or folder (the same as `total` without a filter). */
  scoped: UsageTotals
  folders: { name: string; totals: UsageTotals }[]
  projects: { id: string | null; title: string; folder: string; totals: UsageTotals }[]
  /** Per service and model, inside the requested video or folder. */
  lines: UsageLine[]
}

/** Result of «Проверить» in «Google в Chrome». */
export interface ChromeCheck {
  /** browser-harness started (it is found). */
  harness: boolean
  /** It reached Chrome over remote debugging. */
  chrome: boolean
  flowTabs: { url: string; title: string }[]
  /** The Flow project videos will go to (the one in the settings, or the first open one). */
  flowMatch: string | null
  geminiTab: boolean
  /** Chrome has a Google sign-in; null when it could not be read. */
  signedIn: boolean | null
  error?: string
}

export interface LocalStatus {
  comfy: boolean
  voiceStudio: boolean
  llm: boolean
  /** API-format graphs in the workflows folder; null when the folder is not found. */
  workflows?: number | null
  /** Ollama answers at the script writer's address (or the default one). */
  ollama?: boolean
}

/** What one Higgsfield request would cost, from the API's estimate endpoint. */
export interface CreditEstimate {
  credits: number
  usd: number | null
}

/** The local Whisper model used to time caption words. */
export interface WhisperStatus {
  state: 'missing' | 'downloading' | 'verifying' | 'ready'
  received: number
  total: number
  error: string | null
  /** A speech model already installed on this computer (faster-whisper), used when Whisper Small is not downloaded. */
  local: { name: string; path: string } | null
  /** Which engine recognition uses now; null when none is available. */
  engine: 'whispercpp' | 'faster-whisper' | null
}

export interface ModelOption {
  id: string
  name: string
  description?: string
  contextLength?: number | null
  /** USD per 1M input / output tokens, when the provider publishes it. */
  priceIn?: number | null
  priceOut?: number | null
  /** Short labels the picker can filter on, e.g. "JSON", "Gratis", "Gambar". */
  tags: string[]
  /** Model family, e.g. "Kling", for a brand mark next to the name. */
  family?: string
  /** Higgsfield credits (and dollars) for one request; undefined while unknown, null when it cannot be estimated. */
  credits?: number | null
  usd?: number | null
  /** What the credits pay for, e.g. "10 dtk". */
  creditUnit?: string
}

export interface ModelList {
  models: ModelOption[]
  fetchedAt: number
}

export interface ExportOptions {
  fileName: string
  resolution: 720 | 1080 | 2160
  fps: 30 | 60
  burnCaptions: boolean
  writeSrt: boolean
  normalizeAudio: boolean
  duckMusic: boolean
  folder: string
}

export interface ClipPatchEvent {
  clipId: string
  patch: Partial<Clip>
}

export interface CharacterPatchEvent {
  characterId: string
  patch: Partial<Character>
}
