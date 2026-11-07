import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Image as ImageIcon,
  MoreHorizontal,
  Move,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Volume2
} from 'lucide-react'
import { CHATGPT_IMAGE_MODEL, FLOW_IMAGE_MODEL, FLOW_VIDEO_MODEL, LOCAL_MODELS, TALKING_HEAD_MODEL, fitDuration, getImageModel, getVideoModel, isFlowModel, isLocalModel } from '@shared/higgsfield'
import { PACK_OF_MODEL } from '@shared/localModels'
import { CAMERA_PRESETS, MOTION_STRENGTHS, cameraAt, cameraCss } from '@shared/motion'
import { needsVisual } from '@shared/script'
import { geminiVoiceName, geminiVoiceTone } from '@shared/models'
import type { Asset, Clip } from '@shared/types'
import { AutoTextarea } from '../../components/AutoTextarea'
import { CharacterAvatar } from '../../components/CharacterAvatar'
import { ClipVisual } from '../../components/ClipVisual'
import { Badge, Button, Chip, IconButton, Menu, Progress, Segmented, confirmDialog, cx, inputCls } from '../../components/ui'
import { clipNumber, errorText, mmss, secLabel } from '../../lib/format'
import { useNarration } from '../../lib/useNarration'
import { useApp } from '../../store/app'
import { isRunning, jobFor, useProject } from '../../store/project'
import { StressFix } from '../../components/StressFix'
import { CharacterModal } from './CharacterModal'

/** Russian plural form: one, few (2-4), many. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function useAudio(): { play: (url: string) => void; stop: () => void; playing: string | null } {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => () => ref.current?.pause(), [])
  return {
    playing,
    play: (url) => {
      ref.current?.pause()
      const a = new Audio(url)
      a.onended = () => setPlaying(null)
      ref.current = a
      void a.play()
      setPlaying(url)
    },
    stop: () => {
      ref.current?.pause()
      setPlaying(null)
    }
  }
}

/** Loops the camera move over the clip image, so a picked move is visible right away without rendering. */
function MotionPreview({ image, clip }: { image: Asset; clip: Clip }) {
  const img = useRef<HTMLImageElement>(null)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const mounted = useRef(false)

  // Picking another move or strength starts the preview again, even after a pause.
  useEffect(() => {
    if (mounted.current) setPlaying(true)
    mounted.current = true
  }, [clip.cameraPreset, clip.motionStrength])

  useEffect(() => {
    const el = img.current
    if (!el) return
    if (!playing) {
      el.style.transform = ''
      return
    }
    const dur = Math.max(1, clip.durationMs / 1000)
    const t0 = performance.now()
    let raf = 0
    const tick = (): void => {
      // One pass of the move, a short hold on its last frame, then again.
      const t = Math.min(((performance.now() - t0) / 1000) % (dur + 0.6), dur)
      el.style.transform = cameraCss(cameraAt(clip.cameraPreset, clip.motionStrength, t / dur, t))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip.cameraPreset, clip.motionStrength, clip.durationMs, image.id])

  return (
    <>
      <img ref={img} src={image.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover will-change-transform" />
      <button
        type="button"
        aria-pressed={playing}
        onClick={() => setPlaying(!playing)}
        className="absolute right-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/80 px-3 text-xs font-medium text-paper hover:bg-ink"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        {playing ? 'Пауза' : 'Смотреть превью'}
      </button>
    </>
  )
}

type EngineKind = 'local' | 'flow' | 'cloud'
const engineKind = (id: string): EngineKind => (isFlowModel(id) ? 'flow' : isLocalModel(id) ? 'local' : 'cloud')
const ENGINE_COST: Record<EngineKind, string> = { local: 'бесплатно', flow: 'бонусы Google Flow', cloud: 'кредиты Higgsfield' }

/** The ways to make a clip's AI video, in plain words: what each does, what it costs and how long it takes. */
const ENGINES: { id: string; name: string; note: string; cost: string }[] = [
  { id: 'local/ltx25-i2v', name: 'LTX 2.5', note: 'Оживляет кадр, со звуками окружения. Самый быстрый.', cost: 'бесплатно · ~3 мин' },
  { id: 'local/h3-ref2v', name: 'MiniMax H3 с лицами', note: 'Оживляет кадр и держит лица персонажей по их картам.', cost: 'бесплатно · ~5 мин' },
  { id: 'local/fasth3-i2v', name: 'FastH3', note: 'Как MiniMax H3, со звуком, но в несколько раз быстрее. Лица по картам не держит.', cost: 'бесплатно · быстро' },
  { id: 'local/wan22-5b-i2v', name: 'Wan 2.2 5B', note: 'Лёгкая модель, 720p, без звука, до 5 секунд. Для фоновых сцен.', cost: 'бесплатно' },
  { id: TALKING_HEAD_MODEL, name: 'Говорящая голова', note: 'Человек с кадра говорит голосом клипа, губы в такт. Лучше всего для реальных людей.', cost: 'бесплатно · ~10 мин' },
  { id: FLOW_VIDEO_MODEL, name: 'Google Flow (Omni)', note: 'Во вкладке Chrome, с персонажами Flow. Реальных людей, которые говорят в камеру, обычно отклоняет.', cost: 'бонусы Flow' }
]

function ClipPanel({ clip, index, total }: { clip: Clip; index: number; total: number }) {
  const { project, clips, characters, assets, jobs, updateClip, updateProject, removeClip, moveClip, addClip, select, flush } = useProject()
  const { toast } = useApp()
  const audio = useAudio()
  const [editPrompt, setEditPrompt] = useState(false)
  // What makes the AI video of each clip (the project's model until another one is picked here).
  const [engines, setEngines] = useState<Record<string, string>>({})
  const [rewriting, setRewriting] = useState(false)
  // What draws each clip's picture (the project's model until another one is picked here).
  const [imgEngines, setImgEngines] = useState<Record<string, string>>({})
  // Which local video models are installed (Настройки › Локальные модели); the others are offered greyed out.
  const [installed, setInstalled] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    void window.api.localModels
      .inventory()
      .then((inv) => setInstalled(Object.fromEntries(inv.packs.map((p) => [p.id, p.state === 'ready']))))
      .catch(() => setInstalled(null))
  }, [])
  if (!project) return null
  const projectModel = getVideoModel(project.videoModel).id
  const engine = engines[clip.id] ?? projectModel
  const projectImage = getImageModel(project.imageModel).id
  const imgEngine = imgEngines[clip.id] ?? projectImage
  const imgOptions: { id: string; label: string; off?: boolean }[] = [
    ...LOCAL_MODELS.filter((m) => m.kind === 'image').map((m) => {
      const pack = PACK_OF_MODEL[m.id]
      const missing = !!installed && !!pack && !installed[pack]
      return { id: m.id, label: `${m.name} — на этом компьютере${missing ? ' (не установлена)' : ''}`, off: missing }
    }),
    ...(isLocalModel(projectImage) ? [] : [{ id: projectImage, label: `${getImageModel(projectImage).name} — Higgsfield, кредиты` }]),
    { id: FLOW_IMAGE_MODEL, label: 'Google Flow (Omni) — в Chrome, с персонажами Flow' },
    { id: CHATGPT_IMAGE_MODEL, label: 'ChatGPT — в Chrome, с картами персонажей' }
  ]
  const makeImage = (): void => void run(() => window.api.generate.clipImage(clip.id, imgEngine === projectImage ? null : imgEngine))
  const engineOptions = ENGINES.some((o) => o.id === projectModel)
    ? ENGINES
    : [
        ...ENGINES,
        {
          id: projectModel,
          name: getVideoModel(projectModel).name,
          note: isLocalModel(projectModel) ? 'Модель на этом компьютере.' : 'Облачная модель Higgsfield.',
          cost: ENGINE_COST[engineKind(projectModel)]
        }
      ]

  const image = clip.imageAssetId ? assets[clip.imageAssetId] : null
  const video = clip.videoAssetId ? assets[clip.videoAssetId] : null
  const voice = clip.audioAssetId ? assets[clip.audioAssetId] : null
  const imageJob = jobFor(jobs, 'image', { clipId: clip.id })
  const narration = useNarration()
  const videoJob = jobFor(jobs, 'video', { clipId: clip.id })
  const versions = Object.values(assets)
    .filter((a) => a.clipId === clip.id && a.kind === 'image')
    .sort((a, b) => a.createdAt - b.createdAt)
  const start = clips.slice(0, index).reduce((n, c) => n + c.durationMs, 0)
  const narrationChanged = !!voice && (voice.prompt ?? '').trim() !== clip.narration.trim()
  const voiceName =
    project.ttsProvider === 'gemini'
      ? `${geminiVoiceName(project.ttsVoice)} · ${geminiVoiceTone(project.ttsVoice) ?? 'Gemini'}`
      : 'ElevenLabs'

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await flush()
      await fn()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Удалить клип ${clipNumber(index)}?`,
      body: 'Клип уйдёт из раскадровки вместе со ссылками на его картинку, видео и голос.',
      confirm: 'Удалить клип',
      danger: true
    })
    if (ok) removeClip(clip.id)
  }

  // Capped by window height, so the settings under the fixed preview keep enough room.
  const aspect = project.aspectRatio === '9:16' ? 'aspect-[9/16] h-[min(300px,40vh)] mx-auto' : 'aspect-video h-[min(282px,36vh)] max-w-full mx-auto'

  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line pl-5 pr-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-xs text-muted">
            Клип {clipNumber(index)} · {mmss(start)} – {mmss(start + clip.durationMs)}
          </span>
          <input
            value={clip.title}
            onChange={(e) => updateClip(clip.id, { title: e.target.value })}
            aria-label="Название клипа"
            className="-ml-1 rounded-md bg-transparent px-1 font-display text-[19px] font-bold outline-none hover:bg-sand focus:bg-sand"
          />
        </div>
        <IconButton label="Предыдущий клип" size={38} disabled={index === 0} onClick={() => select(clips[index - 1].id)}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <IconButton label="Следующий клип" size={38} disabled={index === total - 1} onClick={() => select(clips[index + 1].id)}>
          <ChevronRight className="size-4" />
        </IconButton>
        <Menu
          trigger={(open) => (
            <IconButton label="Действия с клипом" size={38} onClick={open}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          )}
          items={[
            { label: 'Сдвинуть влево', icon: <ArrowLeft className="size-4" />, run: () => moveClip(clip.id, -1) },
            { label: 'Сдвинуть вправо', icon: <ArrowRight className="size-4" />, run: () => moveClip(clip.id, 1) },
            { label: 'Добавить клип после', icon: <Plus className="size-4" />, run: () => addClip(clip.id) },
            { label: 'Удалить клип', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove() }
          ]}
        />
      </div>

      {/* The preview stays put while the settings below it scroll. */}
      <div className="shrink-0 border-b border-line px-5 pb-3.5 pt-4">
        <div className={cx('relative overflow-hidden rounded-xl border-[1.5px] border-ink bg-paper', aspect)}>
          {image && !isRunning(imageJob) && clip.motionType === 'camera' ? (
            <MotionPreview image={image} clip={clip} />
          ) : (
            <ClipVisual clip={clip} image={image} video={video} job={imageJob} large playVideo />
          )}
          {!image && !isRunning(imageJob) && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <Button variant="accent" icon={<Sparkles className="size-4" />} onClick={makeImage}>
                Создать картинку
              </Button>
            </div>
          )}
          {versions.length > 1 && (
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-[10px] border border-ink bg-surface/95 p-1.5">
              {versions.slice(-5).map((v, i, arr) => (
                <button
                  key={v.id}
                  type="button"
                  aria-label={`Выбрать версию ${versions.length - arr.length + i + 1}`}
                  onClick={() => void window.api.assets.setActive(clip.id, v.id)}
                  className={cx(
                    'h-[26px] w-[44px] overflow-hidden rounded-[5px]',
                    v.id === clip.imageAssetId ? 'border-2 border-accent' : 'border border-line-2 opacity-80 hover:opacity-100'
                  )}
                >
                  <img src={v.url} alt="" className="size-full object-cover" />
                </button>
              ))}
              <span className="px-1 text-xs font-semibold">
                Версия {versions.findIndex((v) => v.id === clip.imageAssetId) + 1}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="shrink-0 font-semibold">Чем рисовать</span>
          <select
            value={imgEngine}
            onChange={(e) => setImgEngines({ ...imgEngines, [clip.id]: e.target.value })}
            aria-label="Чем рисовать картинку этого клипа"
            className={cx(inputCls, 'h-9 min-w-0 flex-1 py-0 text-[13px]')}
          >
            {imgOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.off}>
                {o.label}
                {o.id === projectImage ? ' · модель проекта' : ''}
              </option>
            ))}
          </select>
        </label>
        {(imgEngine === FLOW_IMAGE_MODEL || imgEngine === CHATGPT_IMAGE_MODEL) && (
          <p className="-mt-2 text-xs text-muted">
            {imgEngine === FLOW_IMAGE_MODEL
              ? 'Flow нарисует во вкладке Chrome; лица персонажей — из Flow (поле «Персонаж в Google Flow»).'
              : 'ChatGPT нарисует в своей вкладке Chrome; карты персонажей уйдут вложениями, чат потом скроется из истории. Действуют лимиты вашего тарифа.'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {image && (
            <Button size="sm" icon={<RefreshCw className="size-4" />} loading={isRunning(imageJob)} onClick={makeImage}>
              Пересоздать
            </Button>
          )}
          <Button
            size="sm"
            icon={<Upload className="size-4" />}
            title="Своя картинка с диска: например, настоящее фото человека для говорящей головы"
            onClick={() => void run(() => window.api.clips.pickImage(clip.id))}
          >
            Свой кадр
          </Button>
          <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditPrompt(!editPrompt)}>
            {editPrompt ? 'Скрыть промпт' : 'Изменить промпт картинки'}
          </Button>
        </div>

        {editPrompt && (
          <AutoTextarea
            minRows={5}
            autoFocus
            value={clip.visualPrompt}
            onChange={(e) => updateClip(clip.id, { visualPrompt: e.target.value })}
            aria-label="Промпт картинки"
            placeholder={[
              'Setting: место, мир или планета, эпоха, детали фона',
              'Action: кто что делает',
              'Wardrobe: Leo - default outfit as on the reference sheet; the teenager - custom for this scene: grey tunic',
              'Framing: medium shot, eye level',
              'Avoid: Earth landscape, aliens'
            ].join('\n')}
            className={cx(inputCls, 'py-2.5 text-[13px] leading-relaxed')}
          />
        )}

        {characters.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Персонажи в клипе</span>
            <div className="flex flex-wrap gap-1.5">
              {characters.map((c) => {
                const on = clip.characterIds.includes(c.id)
                const sheet = c.sheetAssetId ? assets[c.sheetAssetId] : null
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    title={sheet ? undefined : 'Листа персонажа пока нет'}
                    onClick={() =>
                      updateClip(clip.id, {
                        characterIds: on ? clip.characterIds.filter((x) => x !== c.id) : [...clip.characterIds, c.id]
                      })
                    }
                    className={cx(
                      'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border py-0 pl-1 pr-3 text-[13px] font-medium transition-colors',
                      on ? 'border-ink bg-ink text-paper' : 'border-line-2 bg-surface text-ink hover:border-ink-2'
                    )}
                  >
                    <CharacterAvatar name={c.name} sheetUrl={sheet?.url} size={28} className={on ? 'border-paper/70' : undefined} />
                    {c.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label htmlFor="naskah" className="text-sm font-semibold">
              Текст закадрового голоса
            </label>
            <span className="text-xs text-muted">для озвучки</span>
            <span className="flex-1" />
            <span className="text-xs text-ink-2">{voiceName}</span>
            <span className="rounded-md bg-sand px-1.5 py-0.5 font-mono text-xs text-ink-2">
              {voice?.durationMs ? secLabel(voice.durationMs) : 'Голоса нет'}
            </span>
          </div>
          <AutoTextarea
            id="naskah"
            minRows={3}
            value={clip.narration}
            onChange={(e) => updateClip(clip.id, { narration: e.target.value })}
            className={cx(inputCls, 'py-2.5 text-sm leading-relaxed')}
          />
          <div className="flex items-center gap-2">
            {voice && (
              <Button
                size="sm"
                icon={audio.playing === voice.url ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                onClick={() => (audio.playing === voice.url ? audio.stop() : audio.play(voice.url))}
              >
                {audio.playing === voice.url ? 'Стоп' : 'Слушать голос'}
              </Button>
            )}
            {/* Voices come from one take of the whole script (toolbar button), never per scene. */}
            {narration.running ? (
              <span className="text-xs text-sun-ink">Записываем закадровый голос…</span>
            ) : narrationChanged ? (
              <span className="text-xs text-accent-dark">
                Текст изменился.{' '}
                <button type="button" onClick={() => void narration.start()} className="font-semibold underline">
                  Перезаписать голос
                </button>
              </span>
            ) : (
              !voice && <span className="text-xs text-muted">Голос для всех сцен записывается сразу, кнопкой «Записать голос» вверху.</span>
            )}
          </div>
          {voice && <StressFix clipId={clip.id} narration={clip.narration} busy={isRunning(jobFor(jobs, 'tts', { clipId: clip.id }))} />}
        </div>

        <div className="flex flex-col gap-2 pb-2">
          <span className="text-sm font-semibold">Движение</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'camera', title: 'Движение камеры', sub: 'Наезд или панорама по кадру · бесплатно', icon: <Move className="size-[22px]" />, subCls: 'text-ok-ink' },
                { id: 'video', title: 'AI-видео', sub: `Кадр оживает · ${ENGINE_COST[engineKind(engine)]}`, icon: <Film className="size-[22px]" />, subCls: engineKind(engine) === 'local' ? 'text-ok-ink' : 'text-ink-2' }
              ] as const
            ).map((o) => {
              const on = clip.motionType === o.id
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => updateClip(clip.id, { motionType: o.id })}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-left',
                    on ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 bg-surface hover:border-ink-2'
                  )}
                >
                  {o.icon}
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{o.title}</span>
                    <span className={cx('text-xs', o.subCls)}>{o.sub}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {clip.motionType === 'camera' ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {CAMERA_PRESETS.map((p) => (
                  <Chip key={p.id} on={clip.cameraPreset === p.id} className="h-8 px-3 text-[13px]" onClick={() => updateClip(clip.id, { cameraPreset: p.id })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
              <Segmented
                size="sm"
                value={clip.motionStrength}
                onChange={(v) => updateClip(clip.id, { motionStrength: v })}
                options={MOTION_STRENGTHS.map((m) => ({ id: m.id, label: m.label }))}
                className="self-start"
              />
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {!voice && (
                <p className="rounded-lg bg-sun-soft px-2.5 py-1.5 text-xs text-sun-ink">
                  Сначала запишите голос. Длина клипа зависит от голоса, и AI-видео получится нужной длины.
                </p>
              )}
              {video?.durationMs != null && video.durationMs + 300 < clip.durationMs && (
                <p className="rounded-lg bg-sun-soft px-2.5 py-1.5 text-xs text-sun-ink">
                  Видео {secLabel(video.durationMs)}, клип {secLabel(clip.durationMs)}. Оставшиеся {secLabel(clip.durationMs - video.durationMs)} покажут
                  застывший последний кадр. Пересоздайте видео, чтобы совпало.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">1. Чем создать видео</span>
                {engineOptions.map((o) => {
                  const on = engine === o.id
                  const missing = !!installed && !!PACK_OF_MODEL[o.id] && !installed[PACK_OF_MODEL[o.id]]
                  const off = (o.id === TALKING_HEAD_MODEL && !clip.audioAssetId) || missing
                  return (
                    <label
                      key={o.id}
                      className={cx(
                        'flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-[13px]',
                        off ? 'cursor-not-allowed border-line opacity-50' : 'cursor-pointer',
                        on ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-2'
                      )}
                    >
                      <input type="radio" className="mt-0.5" checked={on} disabled={off} onChange={() => setEngines({ ...engines, [clip.id]: o.id })} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">
                          {o.name}
                          {o.id === projectModel && <span className="ml-1.5 font-normal text-muted">· модель проекта</span>}
                        </span>
                        <span className="text-xs text-ink-2">
                          {missing ? 'Не установлена — скачайте в «Настройки › Локальные модели».' : off ? 'Нужен голос клипа — сначала запишите голос.' : o.note}
                        </span>
                      </span>
                      <span className={cx('shrink-0 text-xs', engineKind(o.id) === 'local' ? 'text-ok-ink' : 'text-ink-2')}>{o.cost}</span>
                    </label>
                  )
                })}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] font-semibold">2. Что происходит в кадре</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Sparkles className="size-3.5" />}
                    loading={rewriting}
                    title="Написать описание заново по текущему сюжету, голосу, кадру и манере персонажей — с учётом того, что уже написано здесь"
                    onClick={async () => {
                      setRewriting(true)
                      try {
                        await flush()
                        updateClip(clip.id, { videoPrompt: await window.api.story.motionPrompt(clip.id, engine) })
                      } catch (e) {
                        toast('error', errorText(e))
                      } finally {
                        setRewriting(false)
                      }
                    }}
                  >
                    {rewriting ? 'Пишем…' : 'Переписать по сцене'}
                  </Button>
                </div>
                <AutoTextarea
                  minRows={2}
                  value={clip.videoPrompt}
                  onChange={(e) => updateClip(clip.id, { videoPrompt: e.target.value })}
                  placeholder="Например: she smiles and nods, the camera slowly pushes in"
                  aria-label="Что происходит в кадре"
                  className={cx(inputCls, 'py-2 text-[13px] leading-relaxed')}
                />
                <span className="text-xs text-muted">
                  {engine === TALKING_HEAD_MODEL
                    ? 'Мимика и жесты говорящего. Губы двигаются в такт голосу сами.'
                    : 'Как двигаются люди и камера. Лучше по-английски: так модели понимают точнее. Пусто — лёгкое естественное движение.'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={video ? 'secondary' : 'accent'}
                  icon={<Clapperboard className="size-4" />}
                  loading={isRunning(videoJob)}
                  disabled={(!image && !isFlowModel(engine)) || (engine === TALKING_HEAD_MODEL && !clip.audioAssetId)}
                  onClick={async () => {
                    if (isFlowModel(engine)) {
                      const ok = await confirmDialog({
                        title: 'Создать видео в Google Flow?',
                        body: 'Запрос уйдёт агенту Google Flow в открытой вкладке Chrome; приложение подтвердит только этот запрос. Flow спишет свои бонусы — сколько, видно в его запросе на одобрение. Вкладку Flow не закрывайте, пока видео не скачается. Если Flow откажет, сцену сделает модель на этом компьютере.',
                        confirm: 'Создать во Flow',
                        cancel: 'Отмена'
                      })
                      if (!ok) return
                    }
                    void run(() => window.api.generate.clipVideo(clip.id, engine))
                  }}
                >
                  {video ? 'Пересоздать видео' : 'Создать видео'}
                </Button>
                <span className="text-xs text-muted">
                  {getVideoModel(engine).name} · видео {fitDuration(getVideoModel(engine), clip.durationMs / 1000)} с
                </span>
                {!image && !isFlowModel(engine) && <span className="basis-full text-xs text-muted">Сначала создайте картинку, потом из неё видео.</span>}
                {isRunning(videoJob) && (
                  <span className="basis-full text-xs text-sun-ink">
                    {videoJob!.message ?? 'Обработка'} {Math.round(videoJob!.progress * 100)}%
                  </span>
                )}
                {videoJob?.status === 'failed' && <span className="basis-full text-xs text-bad-ink">{videoJob.error}</span>}
              </div>
              <button type="button" onClick={() => updateProject({ step: 1 })} className="self-start text-xs text-accent-dark hover:underline">
                Модель проекта по умолчанию и облачные модели — на шаге «Идея»
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export function StoryboardStep() {
  const { project, clips, characters, assets, jobs, selectedClipId, select, addClip, updateProject, flush, load } = useProject()
  const { toast } = useApp()
  /** A character id, "new" for an unsaved one, or null. */
  const [openChar, setOpenChar] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [videoCredits, setVideoCredits] = useState<number | null>(null)
  const [planning, setPlanning] = useState(false)
  const lastNarration = useRef<string | null>(null)

  // A failed narration take is reported once, when it happens.
  useEffect(() => {
    const j = jobFor(jobs, 'narration', {})
    const key = j ? `${j.id}:${j.status}` : null
    if (j?.status === 'failed' && lastNarration.current && lastNarration.current !== key) toast('error', j.error ?? 'Не удалось записать закадровый голос')
    lastNarration.current = key
  }, [jobs])

  useEffect(() => {
    if (project)
      void window.api.generate
        .estimate('image', getImageModel(project.imageModel).id, project.aspectRatio)
        .then((e) => setCredits(e?.credits ?? null))
  }, [project?.id, project?.imageModel, project?.aspectRatio])

  const stats = useMemo(() => {
    const imgs = clips.filter((c) => c.imageAssetId).length
    const voices = clips.filter((c) => c.audioAssetId).length
    const needImg = clips.filter((c) => !c.imageAssetId && !isRunning(jobFor(jobs, 'image', { clipId: c.id }))).length
    const videoRunning = clips.filter((c) => isRunning(jobFor(jobs, 'video', { clipId: c.id }))).length
    const needVideo = clips.filter((c) => !c.videoAssetId && !isRunning(jobFor(jobs, 'video', { clipId: c.id })))
    return { imgs, voices, needImg, videoRunning, needVideo, total: clips.reduce((n, c) => n + c.durationMs, 0) }
  }, [clips, jobs])

  // Video length follows each clip's voice, so the cost is estimated per video length and summed.
  const videoLengths = useMemo(() => {
    if (!project) return ''
    const model = getVideoModel(project.videoModel)
    return stats.needVideo.map((c) => fitDuration(model, c.durationMs / 1000) ?? 5).join(',')
  }, [stats.needVideo, project?.videoModel])
  useEffect(() => {
    if (!project || !videoLengths) return setVideoCredits(null)
    const lengths = videoLengths.split(',').map(Number)
    const unique = [...new Set(lengths)]
    const model = getVideoModel(project.videoModel).id
    let live = true
    void Promise.all(unique.map((s) => window.api.generate.estimate('video', model, project.aspectRatio, s, project.videoResolution))).then((list) => {
      if (!live) return
      if (list.some((e) => e?.credits == null)) return setVideoCredits(null)
      const bySec = new Map(unique.map((s, i) => [s, list[i]!.credits]))
      setVideoCredits(lengths.reduce((n, s) => n + (bySec.get(s) ?? 0), 0))
    })
    return () => {
      live = false
    }
  }, [videoLengths, project?.aspectRatio, project?.videoResolution])

  if (!project) return null
  const selIndex = Math.max(0, clips.findIndex((c) => c.id === selectedClipId))
  const sel = clips[selIndex]

  const bulk = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await flush()
      await fn()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const narration = useNarration()
  // Videos are made last: every clip has its picture, and the voice is final so each video matches its clip length.
  const readyForVideo =
    clips.length > 0 &&
    clips.every((c) => c.imageAssetId) &&
    narration.voiced > 0 &&
    narration.stale === 0 &&
    !narration.running
  const makeVideos = async (): Promise<void> => {
    const n = stats.needVideo.length
    const ok = await confirmDialog({
      title: `Сделать AI-видео из ${n} ${plural(n, 'клипа', 'клипов', 'клипов')}?`,
      body:
        `Картинку каждого клипа оживит ${getVideoModel(project!.videoModel).name}, длина видео совпадёт с голосом клипа.` +
        (videoCredits != null ? ` Примерная стоимость: ${Math.round(videoCredits * 10) / 10} кредитов Higgsfield.` : '') +
        ' Клипы, у которых уже есть видео, не пересоздаются.',
      confirm: `Создать видео: ${n}`
    })
    if (ok) await bulk(() => window.api.generate.missingVideos(project!.id))
  }

  // Scenes added or rewritten in the script since the last visual plan.
  const stale = clips.filter(needsVisual).length
  const planVisuals = async (): Promise<void> => {
    setPlanning(true)
    try {
      await flush()
      load(await window.api.story.visuals(project.id, 'missing'))
      toast('success', 'Картинки сцен продуманы.')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setPlanning(false)
    }
  }

  if (!clips.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h2 className="font-display text-3xl font-bold">Раскадровка пока пустая</h2>
        <p className="max-w-md text-ink-2">Сначала напишите сценарий на шаге «Сценарий», потом создайте картинки сцен. Клипы можно добавить и вручную.</p>
        <div className="flex gap-2.5">
          <Button onClick={() => updateProject({ step: 2 })}>К сценарию</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => addClip(null)}>
            Добавить клип
          </Button>
        </div>
      </div>
    )

  return (
    <div className="grid h-full grid-rows-[64px_minmax(0,1fr)_80px]">
      <div className="flex items-center gap-2 border-b border-line bg-paper px-6">
        <span className="mr-1 text-[13px] font-semibold text-ink-2">Персонажи</span>
        <div className="scroll-thin flex min-w-0 gap-2 overflow-x-auto py-1">
          {characters.map((c) => {
            const sheet = c.sheetAssetId ? assets[c.sheetAssetId] : null
            const running = isRunning(jobFor(jobs, 'sheet', { characterId: c.id }))
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenChar(c.id)}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-line-2 bg-surface py-0 pl-1 pr-3 text-[13px] font-medium hover:border-ink-2"
              >
                <CharacterAvatar name={c.name} sheetUrl={sheet?.url} size={32} busy={running} />
                {c.name}
                {!sheet && !running && <span className="size-1.5 rounded-full bg-accent" title="Листа персонажа пока нет" />}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setOpenChar('new')}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-3 px-3.5 text-[13px] font-medium text-ink-2 hover:border-ink-2"
          >
            <Plus className="size-[15px]" />
            Добавить персонажа
          </button>
        </div>
        <div className="flex-1" />
        <Button
          icon={<Volume2 className="size-[17px]" />}
          loading={narration.running}
          disabled={narration.running || !clips.some((c) => c.narration.trim())}
          title="Голос для всех сцен записывается одним заходом и режется по сценам, так тембр и интонация не скачут."
          onClick={() => void narration.start()}
        >
          {narration.running
            ? `${narration.message ?? 'Записываем голос'} ${Math.round(narration.progress * 100)}%`
            : narration.voiced === 0
              ? 'Записать голос'
              : narration.stale
                ? `Обновить голос (${narration.stale})`
                : 'Перезаписать голос'}
        </Button>
        <Button
          className="border-[1.5px] border-ink font-semibold"
          icon={<ImageIcon className="size-[17px]" />}
          disabled={!stats.needImg}
          onClick={() => void bulk(() => window.api.generate.missingImages(project.id))}
        >
          Создать {stats.needImg} {plural(stats.needImg, 'картинку', 'картинки', 'картинок')}
          {credits != null && stats.needImg > 0 && (
            <span className="font-normal text-ink-2">≈ {Math.round(credits * stats.needImg * 10) / 10} кр.</span>
          )}
        </Button>
        {readyForVideo && (
          <Button
            variant="primary"
            icon={<Clapperboard className="size-[17px]" />}
            loading={stats.videoRunning > 0}
            disabled={stats.videoRunning > 0 || stats.needVideo.length === 0}
            title="Все картинки и голос готовы. Каждый клип станет AI-видео длиной в свой голос."
            onClick={() => void makeVideos()}
          >
            {stats.videoRunning > 0
              ? `Создаём видео: ${stats.videoRunning}`
              : stats.needVideo.length === 0
                ? 'Все клипы уже с видео'
                : `Сделать видео: ${stats.needVideo.length}`}
            {stats.videoRunning === 0 && videoCredits != null && stats.needVideo.length > 0 && (
              <span className="font-normal text-white/80">≈ {Math.round(videoCredits * 10) / 10} кр.</span>
            )}
          </Button>
        )}
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_540px]">
        <section className="scroll-thin flex min-h-0 flex-col gap-3.5 overflow-y-auto px-6 pb-6 pt-[18px]">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">Раскадровка</h1>
            <span className="text-sm text-muted">
              {clips.length} {plural(clips.length, 'клип', 'клипа', 'клипов')} · {mmss(stats.total)}
            </span>
            <div className="flex-1" />
            <Button variant="ghost" icon={<Plus className="size-[17px]" />} onClick={() => addClip(sel?.id ?? null)}>
              Добавить клип
            </Button>
          </div>
          {stale > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm text-sun-ink">
              <Sparkles className="size-[18px] shrink-0" />
              <span className="flex-1">
                {plural(stale, 'Сцена', 'Сцены', 'Сцен')} без картинок по свежему сценарию: {stale}. Сначала продумайте картинки, чтобы они совпали с сюжетом.
              </span>
              <Button size="sm" variant="secondary" loading={planning} onClick={() => void planVisuals()}>
                Продумать картинки
              </Button>
            </div>
          )}
          <div className={cx('grid gap-3.5', project.aspectRatio === '9:16' ? 'grid-cols-4' : 'grid-cols-3')}>
            {clips.map((c, i) => {
              const on = c.id === sel?.id
              const imageJob = jobFor(jobs, 'image', { clipId: c.id })
              const ttsRunning = isRunning(jobFor(jobs, 'tts', { clipId: c.id }))
              const status = c.imageAssetId ? { label: 'Готово', tone: 'ok' as const } : isRunning(imageJob) ? { label: 'В работе', tone: 'warn' as const } : imageJob?.status === 'failed' ? { label: 'Ошибка', tone: 'bad' as const } : { label: 'Черновик', tone: 'draft' as const }
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => select(c.id)}
                  className={cx(
                    'flex flex-col overflow-hidden rounded-[14px] bg-surface text-left',
                    on ? 'border-2 border-accent shadow-ink-md' : 'border border-line hover:border-line-3'
                  )}
                >
                  <div className={cx('relative w-full overflow-hidden bg-paper', project.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-video')}>
                    <ClipVisual
                      clip={c}
                      image={c.imageAssetId ? assets[c.imageAssetId] : null}
                      video={c.videoAssetId ? assets[c.videoAssetId] : null}
                      job={imageJob}
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-ink px-[7px] py-0.5 font-mono text-xs text-paper">{clipNumber(i)}</span>
                    {c.motionType === 'video' && (
                      <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md bg-ink text-paper" title="AI-видео">
                        <Film className="size-3.5" />
                      </span>
                    )}
                    <span className="absolute bottom-2 right-2 rounded-md border border-ink bg-surface px-[7px] py-px font-mono text-xs">
                      {mmss(c.durationMs)}
                    </span>
                  </div>
                  <div className="flex w-full flex-col gap-2 px-3 pb-3 pt-2.5">
                    <span className="truncate text-sm font-semibold">{c.title || 'Без названия'}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className={cx('inline-flex items-center gap-1 text-xs', c.audioAssetId ? 'text-ok-ink' : 'text-muted')}>
                        <Volume2 className="size-3.5" />
                        {ttsRunning ? 'Записываем голос…' : c.audioAssetId ? 'Голос готов' : 'Голоса нет'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
        {sel && <ClipPanel key={sel.id} clip={sel} index={selIndex} total={clips.length} />}
      </div>

      <footer className="flex items-center gap-4 border-t border-line bg-surface px-6">
        <div className="flex w-[320px] flex-col gap-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="font-semibold">
              Картинки: {stats.imgs} из {clips.length}
            </span>
            <span className="text-muted">
              Голос: {stats.voices} из {clips.length}
            </span>
          </div>
          <Progress value={clips.length ? (stats.imgs + stats.voices) / (clips.length * 2) : 0} />
        </div>
        <span className="text-[13px] text-muted">Неготовые клипы тоже можно открыть в монтаже.</span>
        <div className="flex-1" />
        <Button size="lg" onClick={() => updateProject({ step: 2 })}>
          Назад к сценарию
        </Button>
        <Button
          variant="primary"
          size="lg"
          className="h-[50px]"
          onClick={() => updateProject({ step: 4, status: project.status === 'exported' ? 'exported' : 'editing' })}
        >
          Перейти к монтажу
          <ArrowRight className="size-[18px]" />
        </Button>
      </footer>
      <CharacterModal characterId={openChar} onClose={() => setOpenChar(null)} onCreated={(id) => setOpenChar(id)} />
    </div>
  )
}
