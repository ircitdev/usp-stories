import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Copy, Folder, FolderOpen, FolderPlus, MoreHorizontal, Plus, Search, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { FolderSettingsModal } from './FolderSettingsModal'
import { DURATIONS, LANGUAGES, llmName } from '@shared/models'
import { getStyle } from '@shared/styles'
import type { ApiProvider, AppSettings, AspectRatio, KeyStatus, ProjectStatus, ProjectSummary, TtsProvider } from '@shared/types'
import { Logo } from '../components/Logo'
import { Select, type SelectOption } from '../components/Select'
import { StyleSwatch } from '../components/StyleArt'
import { AutoTextarea } from '../components/AutoTextarea'
import { StyleMenu } from '../components/StyleMenu'
import { Badge, Button, Chip, IconButton, Menu, confirmDialog, cx } from '../components/ui'
import { errorText, mmss, relativeTime } from '../lib/format'
import { isLocalModel } from '@shared/higgsfield'
import { TTS_NAMES, ttsReadiness, usableTts } from '../lib/keys'
import { useApp } from '../store/app'

const STATUS: Record<ProjectStatus, { label: string; tone: 'draft' | 'info' | 'warn' | 'ok' }> = {
  draft: { label: 'Черновик', tone: 'draft' },
  script: { label: 'Сценарий', tone: 'info' },
  storyboard: { label: 'Раскадровка', tone: 'info' },
  editing: { label: 'Монтаж', tone: 'warn' },
  exported: { label: 'Экспортирован', tone: 'ok' }
}

const FILTERS: { id: 'all' | 'draft' | 'progress' | 'exported'; label: string; match: (s: ProjectStatus) => boolean }[] = [
  { id: 'all', label: 'Все', match: () => true },
  { id: 'draft', label: 'Черновики', match: (s) => s === 'draft' },
  { id: 'progress', label: 'В работе', match: (s) => s === 'script' || s === 'storyboard' || s === 'editing' },
  { id: 'exported', label: 'Экспортированы', match: (s) => s === 'exported' }
]

const SUGGESTIONS = [
  'Один день на телеканале: как подростки впервые вышли в прямой эфир',
  'Медиа-тур по Москве: пять дней, три редакции и первый свой репортаж',
  'Как школьник снял влог в Останкино и что он узнал о профессии блогера'
]

/** "a, b и c" */
function joinList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`
}

const ASPECTS: SelectOption<AspectRatio>[] = [
  { value: '16:9', label: '16:9 · YouTube', icon: <span className="block h-[10px] w-[17px] rounded-[2px] border-[1.5px] border-ink" /> },
  { value: '9:16', label: '9:16 · Shorts', icon: <span className="mx-[3px] block h-[16px] w-[10px] rounded-[2px] border-[1.5px] border-ink" /> }
]

export function Home() {
  const { go, toast } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  /** Folder shown; null shows every project. */
  const [folder, setFolder] = useState<string | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [synopsis, setSynopsis] = useState('')
  const [durationSec, setDurationSec] = useState(60)
  const [language, setLanguage] = useState('id')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [styleId, setStyleId] = useState('stickman')
  const [tts, setTts] = useState<TtsProvider>('gemini')
  const [creating, setCreating] = useState(false)

  const refresh = (): void => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((e) => toast('error', errorText(e)))
  }

  useEffect(() => {
    refresh()
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.get().then((s) => {
      setAppSettings(s)
      setTts(s.defaultTtsProvider)
      setLanguage(s.defaultLanguage)
    })
  }, [])

  // Start on a narrator service that has a working key.
  useEffect(() => {
    if (appSettings && keys.length) setTts(usableTts(appSettings.defaultTtsProvider, keys))
  }, [appSettings, keys])

  const ttsOptions = useMemo((): SelectOption<TtsProvider>[] => {
    const ready = ttsReadiness(keys)
    return (['voicestudio', 'gemini', 'elevenlabs'] as const).map((p) => {
      const blocked = keys.length > 0 && !ready[p].ok
      return { value: p, label: TTS_NAMES[p], disabled: blocked, note: blocked ? `${ready[p].reason}. Укажите в настройках.` : undefined }
    })
  }, [keys])

  const setupIssues = useMemo(() => {
    if (!appSettings || !keys.length) return []
    // A key counts once it is saved and did not fail its last check.
    const ok = (p: ApiProvider): boolean => {
      const k = keys.find((x) => x.provider === p)
      return !!k?.configured && k.lastOk !== false
    }
    const issues: { what: string; blocks: string }[] = []
    // Local models (ComfyUI) need no Higgsfield key; only the cloud models do.
    if (!(isLocalModel(appSettings.imageModel) && isLocalModel(appSettings.videoModel)) && !ok('higgsfield'))
      issues.push({ what: 'ключ Higgsfield', blocks: 'картинки' })
    const llm = appSettings.llmProvider
    // A local OpenAI-compatible server (Ollama, LM Studio) needs an address, not a key.
    if (llm === 'custom' ? !appSettings.customBaseUrl.trim() : !ok(llm)) issues.push({ what: `ключ ${llmName(llm)}`, blocks: 'сценарий' })
    else if (!appSettings.llmModels[llm]) issues.push({ what: `модель ${llmName(llm)}`, blocks: 'сценарий' })
    // Narration needs just one working voice service; every project can pick either one.
    const tts = ttsReadiness(keys)
    if (!tts.voicestudio.ok && !tts.gemini.ok && !tts.elevenlabs.ok) issues.push({ what: 'ключ Gemini или ElevenLabs', blocks: 'закадровый голос' })
    return issues
  }, [keys, appSettings])

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!
    const q = query.trim().toLowerCase()
    return (projects ?? []).filter((p) => f.match(p.status) && (!q || p.title.toLowerCase().includes(q)) && (folder === null || p.folder === folder))
  }, [projects, filter, query, folder])

  // Folders: the saved list (empty ones too) and any folder a project is in.
  const folders = useMemo(
    () => [...new Set([...(appSettings?.projectFolders ?? []), ...(projects ?? []).map((p) => p.folder).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru')),
    [appSettings, projects]
  )
  const saveFolders = async (list: string[]): Promise<void> => setAppSettings(await window.api.settings.set({ projectFolders: list }))
  const addFolder = async (): Promise<void> => {
    const name = (naming ?? '').trim()
    setNaming(null)
    if (!name) return
    if (!folders.includes(name)) await saveFolders([...(appSettings?.projectFolders ?? []), name])
    setFolder(name)
  }
  const removeFolder = async (name: string): Promise<void> => {
    const inside = (projects ?? []).filter((p) => p.folder === name)
    const ok = await confirmDialog({
      title: `Удалить папку «${name}»?`,
      body: inside.length ? `Проекты из неё (${inside.length}) останутся и будут без папки.` : 'Папка пустая.',
      confirm: 'Удалить папку',
      cancel: 'Отмена'
    })
    if (!ok) return
    for (const p of inside) await window.api.projects.setFolder(p.id, '')
    await saveFolders((appSettings?.projectFolders ?? []).filter((f) => f !== name))
    setFolder(null)
    refresh()
  }
  const moveTo = async (p: ProjectSummary, name: string): Promise<void> => {
    await window.api.projects.setFolder(p.id, name)
    refresh()
  }

  const start = async (): Promise<void> => {
    setCreating(true)
    try {
      const b = await window.api.projects.create({ synopsis, durationSec, language, aspectRatio, styleId, ttsProvider: tts })
      // A project made while a folder is open goes into it.
      if (folder) {
        await window.api.projects.setFolder(b.project.id, folder)
        // …and starts with the folder's characters, captions, logos and intro/outro.
        await window.api.folders.apply(folder, b.project.id)
      }
      go({ name: 'project', id: b.project.id })
    } catch (e) {
      toast('error', errorText(e))
      setCreating(false)
    }
  }

  const remove = async (p: ProjectSummary): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Удалить проект?',
      body: `«${p.title}» вместе со всеми картинками, видео и озвучкой будет удалён с этого компьютера. Отменить это нельзя.`,
      confirm: 'Удалить проект',
      danger: true
    })
    if (!ok) return
    await window.api.projects.remove(p.id)
    refresh()
  }

  const duplicate = async (p: ProjectSummary): Promise<void> => {
    try {
      await window.api.projects.duplicate(p.id)
      refresh()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-6 border-b border-line bg-surface px-8">
        <Logo />
        <label className="flex h-10 w-[360px] items-center gap-2 rounded-full border border-line bg-sand px-3.5 text-muted">
          <Search className="size-[18px]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск проектов"
            aria-label="Поиск проектов"
            className="flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <div className="flex-1" />
        <Button icon={<SlidersHorizontal className="size-[18px]" />} onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
          Настройки
          {setupIssues.length > 0 && <span className="size-2 rounded-full bg-accent" />}
        </Button>
      </header>

      <main className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-12 pt-11">
          {setupIssues.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm text-sun-ink">
              <AlertTriangle className="size-[18px] shrink-0" />
              <span className="flex-1">
                Перед началом укажите в настройках {joinList(setupIssues.map((i) => i.what))}. Без этого не получится создать{' '}
                {joinList([...new Set(setupIssues.map((i) => i.blocks))])}.
              </span>
              <Button size="sm" variant="secondary" onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
                Настроить
              </Button>
            </div>
          )}
          <div>
            <h1 className="font-display text-[46px] font-bold leading-[1.08] tracking-[-0.025em]">Какое видео снимем сегодня?</h1>
            <p className="mt-3 text-[17px] text-ink-2">
              Опишите идею. ИИ соберёт клипы, сценарий и озвучку, а вам останется доработать всё в редакторе.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-ink bg-surface py-5 pl-6 pr-5 shadow-ink-lg">
            <label htmlFor="ide" className="text-[13px] font-semibold text-ink-2">
              Идея или синопсис
            </label>
            <AutoTextarea
              id="ide"
              minRows={3}
              maxHeight={520}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Например: пятеро подростков из Казани едут в Москву на медиа-тур. За неделю они побывают в студии телеканала, возьмут первое интервью и снимут свой репортаж…"
              className="resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted/70"
            />
            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3.5">
              <Select
                variant="pill"
                label="Длительность"
                value={durationSec}
                onChange={setDurationSec}
                options={DURATIONS.map((d) => ({ value: d.sec, label: d.label }))}
              />
              <Select
                variant="pill"
                label="Язык"
                value={language}
                onChange={setLanguage}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                menuWidth={200}
              />
              <Select variant="pill" label="Формат" value={aspectRatio} onChange={setAspectRatio} options={ASPECTS} menuWidth={200} />
              <StyleMenu value={styleId} onChange={setStyleId} />
              <Select variant="pill" label="Голос рассказчика" value={tts} onChange={setTts} options={ttsOptions} menuWidth={280} />
              <div className="flex-1" />
              <Button variant="primary" size="lg" loading={creating} onClick={() => void start()}>
                Начать
                <ArrowRight className="size-[18px]" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span>Попробуйте идею:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSynopsis(s)}
                className="h-9 rounded-full border border-dashed border-line-3 px-3.5 text-[13px] text-ink-2 hover:border-ink-2 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <section className="mx-auto flex max-w-[1280px] flex-col gap-[18px] px-12 pb-12 pt-11">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-[27px] font-bold tracking-[-0.015em]">Ваши проекты</h2>
            <div className="ml-2 flex gap-1.5">
              {FILTERS.map((f) => {
                const count = (projects ?? []).filter((p) => f.match(p.status)).length
                return (
                  <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}
                    <span className={cx('text-xs', filter === f.id ? 'text-line-2' : 'text-muted')}>{count}</span>
                  </Chip>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Folder className="mr-1 size-4 text-muted" />
            <Chip on={folder === null} onClick={() => setFolder(null)}>
              Все папки
            </Chip>
            {folders.map((f) => (
              <Chip key={f} on={folder === f} onClick={() => setFolder(f)}>
                {f}
                <span className={cx('text-xs', folder === f ? 'text-line-2' : 'text-muted')}>{(projects ?? []).filter((p) => p.folder === f).length}</span>
              </Chip>
            ))}
            {naming === null ? (
              <button
                type="button"
                onClick={() => setNaming('')}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-3 px-3 text-[13px] text-ink-2 hover:border-ink-2"
              >
                <FolderPlus className="size-3.5" /> Папка
              </button>
            ) : (
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addFolder()
                  if (e.key === 'Escape') setNaming(null)
                }}
                onBlur={() => void addFolder()}
                placeholder="Название папки"
                className="h-8 w-44 rounded-full border border-line-2 bg-surface px-3 text-[13px]"
              />
            )}
            {folder !== null && (
              <>
                <Button size="sm" variant="accent" icon={<Settings2 className="size-4" />} onClick={() => setFolderOpen(true)} className="ml-1">
                  Настройки проекта «{folder}»
                </Button>
                <button type="button" onClick={() => void removeFolder(folder)} className="ml-1 text-[13px] text-muted hover:text-bad-ink">
                  Удалить папку
                </button>
              </>
            )}
            {folder !== null && folderOpen && (
              <FolderSettingsModal
                name={folder}
                projectIds={(projects ?? []).filter((p) => p.folder === folder).map((p) => p.id)}
                onClose={() => setFolderOpen(false)}
              />
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => go({ name: 'settings', back: { name: 'home' } })}
              className="text-[12px] text-muted hover:text-accent-dark hover:underline"
              title="Где проекты лежат на диске — Настройки › Общие"
            >
              Папка на диске: {appSettings?.projectsDir || 'по умолчанию'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-5">
            <button
              type="button"
              onClick={() => void start()}
              className="flex min-h-[262px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-3 text-ink-2 hover:border-ink-2 hover:bg-surface"
            >
              <span className="flex size-[54px] items-center justify-center rounded-full border-[1.5px] border-ink bg-accent text-white shadow-ink">
                <Plus className="size-6" strokeWidth={2.2} />
              </span>
              <span className="text-base font-semibold text-ink">Новый проект</span>
              <span className="text-[13px]">Начните с идеи или синопсиса</span>
            </button>

            {visible.map((p) => {
              const st = STATUS[p.status]
              return (
                <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                  <button type="button" onClick={() => go({ name: 'project', id: p.id })} className="text-left">
                    <div className="relative aspect-video w-full overflow-hidden border-b border-line">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <StyleSwatch styleId={p.styleId} className="size-full" iconSize={40} />
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded-full border border-ink bg-surface px-2.5 py-[3px] text-xs font-semibold">
                        {getStyle(p.styleId).name}
                      </span>
                      {p.totalMs > 0 && (
                        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink px-2 py-[3px] font-mono text-xs text-paper">
                          {mmss(p.totalMs)}
                        </span>
                      )}
                    </div>
                    <div className="line-clamp-2 min-h-[46px] px-4 pb-0.5 pt-3.5 text-base font-semibold leading-snug">{p.title}</div>
                  </button>
                  <div className="flex items-center gap-2 py-2 pl-4 pr-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="truncate text-[13px] text-muted">{relativeTime(p.updatedAt)}</span>
                    <div className="flex-1" />
                    <Menu
                      trigger={(open) => (
                        <IconButton label="Действия с проектом" onClick={open} className="border-transparent" size={36}>
                          <MoreHorizontal className="size-[18px]" />
                        </IconButton>
                      )}
                      items={[
                        { label: 'Открыть', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'project', id: p.id }) },
                        { label: 'Дублировать', icon: <Copy className="size-4" />, run: () => void duplicate(p) },
                        ...folders
                          .filter((f) => f !== p.folder)
                          .map((f) => ({ label: `В папку «${f}»`, icon: <Folder className="size-4" />, run: () => void moveTo(p, f) })),
                        ...(p.folder ? [{ label: 'Убрать из папки', icon: <Folder className="size-4" />, run: () => void moveTo(p, '') }] : []),
                        { label: 'Удалить', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove(p) }
                      ]}
                    />
                  </div>
                </article>
              )
            })}
          </div>
          {projects && projects.length === 0 && (
            <p className="text-sm text-muted">Проектов пока нет. Опишите идею выше и нажмите «Начать».</p>
          )}
        </section>
      </main>
    </div>
  )
}
