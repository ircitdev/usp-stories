import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENTS, type StudioApi } from '../shared/api'

const call =
  <T>(channel: string) =>
  (...args: unknown[]): Promise<T> =>
    ipcRenderer.invoke(channel, ...args)

const listen =
  <T>(channel: string) =>
  (cb: (payload: T) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }

const api: StudioApi = {
  projects: {
    list: call('projects:list'),
    create: call('projects:create'),
    get: call('projects:get'),
    save: call('projects:save'),
    remove: call('projects:remove'),
    duplicate: call('projects:duplicate'),
    setFolder: call('projects:setFolder'),
    basePrompt: call('projects:basePrompt'),
    makeCover: call('projects:makeCover'),
    setCover: call('projects:setCover')
  },
  story: {
    script: call('story:script'),
    visuals: call('story:visuals'),
    musicPrompt: call('story:musicPrompt'),
    motionPrompt: call('story:motionPrompt')
  },
  generate: {
    clipImage: call('generate:clipImage'),
    clipVideo: call('generate:clipVideo'),
    clipTts: call('generate:clipTts'),
    characterSheet: call('generate:characterSheet'),
    pickCharacterSheet: call('characters:pickSheet'),
    sheetFromLibrary: call('characters:sheetFromLibrary'),
    sheetFromFile: call('characters:sheetFromFile'),
    missingImages: call('generate:missingImages'),
    missingVideos: call('generate:missingVideos'),
    missingTts: call('generate:missingTts'),
    narration: call('generate:narration'),
    syncCaptions: call('generate:syncCaptions'),
    cancel: call('generate:cancel'),
    estimate: call('generate:estimate')
  },
  clips: {
    split: call('clips:split'),
    detachVoice: call('clips:detachVoice'),
    pickImage: call('clips:pickImage')
  },
  assets: {
    setActive: call('assets:setActive'),
    setWords: call('assets:setWords'),
    pickMusic: call('assets:pickMusic'),
    pickImage: call('assets:pickImage'),
    pickImages: call('assets:pickImages'),
    pickInserts: call('assets:pickInserts'),
    remove: call('assets:remove'),
    rename: call('assets:rename')
  },
  settings: {
    get: call('settings:get'),
    set: call('settings:set'),
    pickProjectsDir: call('settings:pickProjectsDir'),
    keys: call('settings:keys'),
    setKey: call('settings:setKey'),
    setCustom: call('settings:setCustom'),
    clearKey: call('settings:clearKey'),
    revealKey: call('settings:revealKey'),
    testKey: call('settings:testKey'),
    voices: call('settings:voices'),
    localStatus: call('settings:localStatus'),
    library: call('library:list')
  },
  chrome: {
    check: call('chrome:check')
  },
  usage: {
    report: call('usage:report')
  },
  localModels: {
    inventory: call('models:inventory'),
    install: call('models:install'),
    cancel: call('models:cancel'),
    pullOllama: call('models:pullOllama'),
    downloads: call('models:downloads'),
    openFolder: call('models:openFolder')
  },
  music: {
    generate: call('music:generate')
  },
  folders: {
    get: call('folders:get'),
    set: call('folders:set'),
    addLogos: call('folders:addLogos'),
    addInserts: call('folders:addInserts'),
    removeFile: call('folders:removeFile'),
    renameFile: call('folders:renameFile'),
    tracks: call('folders:tracks'),
    addMusic: call('folders:addMusic'),
    basePromptFromUrl: call('folders:basePromptFromUrl'),
    basePromptFromVideo: call('folders:basePromptFromVideo'),
    apply: call('folders:apply')
  },
  fonts: {
    add: call('fonts:add'),
    remove: call('fonts:remove')
  },
  library: {
    list: call('library:list'),
    save: call('library:save'),
    remove: call('library:remove'),
    pickFile: call('library:pickFile'),
    fromVideo: call('library:fromVideo'),
    makeCard: call('library:makeCard'),
    folder: call('library:folder'),
    pickFolder: call('library:pickFolder'),
    openFolder: call('library:openFolder'),
    prepareVoice: call('library:prepareVoice'),
    cloneVoice: call('library:cloneVoice')
  },
  models: {
    list: call('models:list')
  },
  exporter: {
    start: call('export:start'),
    defaultFolder: call('export:defaultFolder'),
    pickFolder: call('export:pickFolder'),
    reveal: call('export:reveal')
  },
  app: {
    openExternal: call('app:openExternal'),
    copyText: call('app:copyText'),
    version: call('app:version')
  },
  whisper: {
    status: call('whisper:status'),
    download: call('whisper:download'),
    cancel: call('whisper:cancel'),
    remove: call('whisper:remove'),
    openFolder: call('whisper:openFolder')
  },
  on: {
    whisper: listen(EVENTS.whisper),
    models: listen(EVENTS.models),
    job: listen(EVENTS.job),
    clip: listen(EVENTS.clip),
    character: listen(EVENTS.character),
    asset: listen(EVENTS.asset)
  }
}

contextBridge.exposeInMainWorld('api', api)
