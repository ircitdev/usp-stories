import type {
  ApiProvider,
  AspectRatio,
  AppSettings,
  Asset,
  CharacterPatchEvent,
  ClipPatchEvent,
  CreditEstimate,
  WhisperStatus,
  ChromeCheck,
  UsagePeriod,
  UsageReport,
  BasePrompt,
  FolderTrack,
  ModelInventory,
  ModelProgress,
  WordTiming,
  ExportOptions,
  Job,
  KeyStatus,
  KeyTestResult,
  ModelList,
  ModelSource,
  MusicPrompt,
  NewProjectInput,
  ProjectBundle,
  ProjectSnapshot,
  ProjectSummary,
  TtsProvider,
  VoiceOption,
  LocalStatus,
  LibraryCharacter,
  LibraryCharacterInput,
  VoiceSample, CharacterFromVideo, CardMode, FolderInsert, FolderSettings } from './types'

/** The typed surface the preload script exposes as `window.api`. */
/** A folder's settings with URLs of its files, for the screens. */
export type FolderView = Omit<FolderSettings, 'logos' | 'inserts'> & {
  logos: (FolderSettings['logos'][number] & { url: string })[]
  inserts: (FolderInsert & { url: string })[]
}

export interface StudioApi {
  projects: {
    list(): Promise<ProjectSummary[]>
    /** The video's folder and that folder's base prompt (null when it has none). */
    basePrompt(projectId: string): Promise<{ folder: string; basePrompt: BasePrompt | null }>
    create(input: NewProjectInput): Promise<ProjectBundle>
    get(id: string): Promise<ProjectBundle>
    save(snapshot: ProjectSnapshot): Promise<{ updatedAt: number }>
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<ProjectSummary>
    setFolder(id: string, folder: string): Promise<void>
    /** A cover made locally from the project's own frames and style. */
    makeCover(id: string): Promise<Asset>
    setCover(id: string, assetId: string): Promise<void>
  }
  story: {
    /** Idea → scene-by-scene script (story and voice-over). */
    script(projectId: string): Promise<ProjectBundle>
    /** Script → one image plan per scene; "missing" skips scenes whose plan still matches their story. */
    visuals(projectId: string, mode: 'missing' | 'all'): Promise<ProjectBundle>
    /** A background-music prompt that fits the finished script, for use in Suno or another music AI. */
    musicPrompt(projectId: string): Promise<MusicPrompt>
    /** «Что происходит в кадре» of a clip, written again from the scene for the chosen video model. */
    motionPrompt(clipId: string, engine: string): Promise<string>
  }
  generate: {
    /** `modelId`: this picture only — a local or cloud model, flow/image or chatgpt/image (in Chrome). */
    clipImage(clipId: string, modelId?: string | null): Promise<Job>
    /** `modelId` overrides the project's video model for this clip only. */
    clipVideo(clipId: string, modelId?: string | null): Promise<Job>
    /** `newTake`: another take of this clip's voice (pronunciation rules apply). */
    clipTts(clipId: string, newTake?: boolean): Promise<Job>
    characterSheet(characterId: string): Promise<Job>
    /** Uses a picture from disk as the character's sheet (no generation). */
    pickCharacterSheet(characterId: string): Promise<Asset | null>
    /** Uses the picture of a character from our registry as the sheet. */
    sheetFromLibrary(characterId: string, libraryId: string): Promise<Asset>
    /** A picture file on disk as the character's sheet. */
    sheetFromFile(characterId: string, path: string): Promise<Asset>
    missingImages(projectId: string): Promise<Job[]>
    /** An AI video for every clip that has an image but no video yet. */
    missingVideos(projectId: string): Promise<Job[]>
    missingTts(projectId: string): Promise<Job[]>
    /** Voices scenes in one continuous take and cuts it per scene: those without a voice, or all of them. */
    narration(projectId: string, mode: 'missing' | 'all'): Promise<Job>
    /** Re-times caption words of voiced scenes against the audio with the local Whisper model. */
    syncCaptions(projectId: string, mode?: 'stale' | 'all'): Promise<Job>
    cancel(jobId: string): Promise<void>
    /** Credits for one image, or one video of about `seconds`, with this model. Null without a working key. */
    estimate(kind: 'image' | 'video', modelId: string, aspect: AspectRatio, seconds?: number, resolution?: string | null): Promise<CreditEstimate | null>
  }
  clips: {
    /** Splits a clip at `atMs` into two clips (picture, voice and narration divided at the nearest pause). */
    split(clipId: string, atMs: number): Promise<ProjectBundle>
    /** Takes the voice off a clip. */
    detachVoice(clipId: string): Promise<void>
    /** Sets the clip picture from a file (a dialog when `path` is not given); null when cancelled. */
    pickImage(clipId: string, path?: string | null): Promise<Asset | null>
  }
  assets: {
    setActive(clipId: string, assetId: string): Promise<void>
    /** Caption words of a voice clip, after the text was fixed by hand. */
    setWords(assetId: string, words: WordTiming[]): Promise<Asset>
    pickMusic(projectId: string): Promise<Asset | null>
    /** A logo or watermark image for an overlay. */
    pickImage(projectId: string): Promise<Asset | null>
    /** Several pictures (logos, watermarks) into the project's media. */
    pickImages(projectId: string): Promise<Asset[]>
    /** Opening / closing videos, several variants. */
    pickInserts(projectId: string, kind: 'intro' | 'outro', paths?: string[]): Promise<Asset[]>
    remove(assetId: string): Promise<void>
    rename(assetId: string, name: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
    /** Moves the projects to a folder picked on disk; null when cancelled. */
    pickProjectsDir(): Promise<AppSettings | null>
    keys(): Promise<KeyStatus[]>
    setKey(provider: ApiProvider, key: string): Promise<KeyTestResult>
    /** Saves an OpenAI-compatible endpoint; the key is optional for local servers. */
    setCustom(baseUrl: string, key: string): Promise<KeyTestResult>
    clearKey(provider: ApiProvider): Promise<void>
    /** The full stored key, only for the "show key" button. */
    revealKey(provider: ApiProvider): Promise<string | null>
    testKey(provider: ApiProvider): Promise<KeyTestResult>
    voices(provider: TtsProvider): Promise<VoiceOption[]>
    localStatus(): Promise<LocalStatus>
    /** Our recurring characters from the shared registry. */
    library(): Promise<LibraryCharacter[]>
  }
  /** Our own characters registry (C:\\AI\\video-kit\\characters.json), editable from Settings › Персонажи. */
  chrome: {
    /** Whether Google Flow and Gemini can be driven in Chrome: browser-harness, the connection, an open Flow project, a Google sign-in. */
    check(): Promise<ChromeCheck>
  }
  usage: {
    /** Spending for a period: overall, per folder, per video and per service (inside a video or folder when given). */
    report(period: UsagePeriod, filter?: { projectId?: string; folder?: string }): Promise<UsageReport>
  }
  localModels: {
    /** What local generation has installed: ComfyUI packs (files and nodes), Ollama models, VoiceStudio, Whisper. */
    inventory(fresh?: boolean): Promise<ModelInventory>
    /** Downloads a pack's missing model files into ComfyUI's models folders. Progress: on.models. */
    install(packId: string): Promise<void>
    cancel(id: string): Promise<void>
    pullOllama(name: string): Promise<void>
    downloads(): Promise<ModelProgress[]>
    openFolder(): Promise<void>
  }
  music: {
    /** Background music from Google Gemini (Lyria): by the API key, or gemini.google.com in Chrome. Becomes the project's music file. */
    generate(projectId: string, source: 'api' | 'chrome' | 'ace-step' | 'stable-audio-3' | 'minimax-music-3'): Promise<Asset>
  }
  folders: {
    get(name: string): Promise<FolderView>
    set(name: string, patch: Partial<FolderSettings>): Promise<FolderView>
    addLogos(name: string): Promise<FolderView>
    addInserts(name: string, kind: 'intro' | 'outro', paths?: string[]): Promise<FolderView>
    removeFile(name: string, id: string): Promise<FolderView>
    renameFile(name: string, id: string, title: string): Promise<FolderView>
    /** All music of the folder: its own tracks and those of its videos. */
    tracks(name: string): Promise<FolderTrack[]>
    addMusic(name: string): Promise<FolderTrack[]>
    /** Makes the folder's base prompt from a site (local or cloud script writer). */
    basePromptFromUrl(name: string, url: string): Promise<FolderView>
    /** Makes the folder's base prompt from a video the user picks (local vision model); null when cancelled. */
    basePromptFromVideo(name: string): Promise<FolderView | null>
    /** Gives a video the folder's captions, characters, logos and default intro/outro. */
    apply(name: string, projectId: string): Promise<void>
  }
  fonts: {
    /** Picks TTF/OTF files and adds them as caption fonts; null when cancelled. */
    add(): Promise<{ fonts: import('./captions').CaptionFont[]; added: string | null } | null>
    remove(id: string): Promise<import('./captions').CaptionFont[]>
  }
  library: {
    list(): Promise<LibraryCharacter[]>
    save(input: LibraryCharacterInput): Promise<LibraryCharacter[]>
    remove(id: string): Promise<LibraryCharacter[]>
    pickFile(kind: 'image' | 'audio' | 'video'): Promise<{ path: string; thumb: string | null } | null>
    /** Reads a character from a real video: appearance, manner, face, portrait, card and (optionally) a cloned voice. */
    fromVideo(path: string, opts: { name: string; cloneVoice: boolean; card?: CardMode }): Promise<CharacterFromVideo>
    /** A studio portrait and a model sheet from one photo, made locally by Qwen-Image 2.1. */
    /** Where the library is: its characters.json and its folder. */
    folder(): Promise<{ file: string; folder: string }>
    /** Picks another library folder (characters.json is created there when missing); null when cancelled. */
    pickFolder(): Promise<LibraryCharacter[] | null>
    openFolder(): Promise<string>
    makeCard(photo: string): Promise<{ portrait: string; sheet: string; portraitThumb: string | null; sheetThumb: string | null }>
    prepareVoice(path: string): Promise<VoiceSample>
    cloneVoice(name: string, samplePath: string, text: string): Promise<VoiceOption>
  }
  models: {
    /** Live model list from the provider. Served from cache unless `refresh` is set or the cache is stale. */
    list(source: ModelSource, refresh?: boolean): Promise<ModelList>
  }
  exporter: {
    start(projectId: string, options: ExportOptions): Promise<Job>
    /** Where exports go; for a video of a folder, its subfolder named after the folder. */
    defaultFolder(projectId?: string): Promise<string>
    pickFolder(): Promise<string | null>
    reveal(path: string): Promise<void>
  }
  app: {
    openExternal(url: string): Promise<void>
    copyText(text: string): Promise<void>
    version(): Promise<string>
  }
  whisper: {
    status(): Promise<WhisperStatus>
    download(): Promise<void>
    cancel(): Promise<void>
    remove(): Promise<void>
    openFolder(): Promise<void>
  }
  on: {
    whisper(cb: (status: WhisperStatus) => void): () => void
    models(cb: (p: ModelProgress) => void): () => void
    job(cb: (job: Job) => void): () => void
    clip(cb: (e: ClipPatchEvent) => void): () => void
    character(cb: (e: CharacterPatchEvent) => void): () => void
    asset(cb: (asset: Asset) => void): () => void
  }
}

export const EVENTS = {
  job: 'event:job',
  clip: 'event:clip',
  character: 'event:character',
  asset: 'event:asset',
  whisper: 'event:whisper',
  models: 'event:models'
} as const
