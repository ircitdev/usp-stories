import { useEffect, useRef, useState } from 'react'
import { AudioLines, Check, Clapperboard, Copy, ExternalLink, Film, Layers, Mic, Move, Music, Play, Sparkles, Type, Volume2, X } from 'lucide-react'
import { captionNeedsSync, replaceCaptionWords } from '@shared/captions'
import { CAMERA_PRESETS, MOTION_STRENGTHS } from '@shared/motion'
import { geminiVoiceName } from '@shared/models'
import { voiceSpan } from '@shared/timeline'
import type { Asset, Clip, WordTiming } from '@shared/types'
import { CaptionSettings } from '../../../components/CaptionSettings'
import { Select } from '../../../components/Select'
import { AutoTextarea } from '../../../components/AutoTextarea'
import { EditableName } from '../../../components/EditableName'
import { Button, Segmented, Switch, cx, inputCls } from '../../../components/ui'
import { clipNumber, errorText, secLabel, timecode } from '../../../lib/format'
import { useApp } from '../../../store/app'
import { useNarration } from '../../../lib/useNarration'
import { isRunning, jobFor, useProject } from '../../../store/project'
import { UNKNOWN_AUDIO_MS, useAudition, useCaptionUi, useTimeline } from './engine'
import { StressFix } from '../../../components/StressFix'
import { OverlayPanel } from './OverlayPanel'
import { TransitionPanel } from './TransitionPanel'

/** Russian plural form: one, few (2-4), many. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** 'transisi' has no button on the rail; it opens from the round buttons between clips on the timeline. */
export type InspectorTab = 'klip' | 'suara' | 'caption' | 'overlay' | 'musik' | 'transisi'

export const INSPECTOR_TABS: { id: InspectorTab; label: string; icon: typeof Move }[] = [
  { id: 'klip', label: 'Клип', icon: Move },
  { id: 'suara', label: 'Голос', icon: Mic },
  { id: 'caption', label: 'Субтитры', icon: Type },
  { id: 'overlay', label: 'Наложения', icon: Layers },
  { id: 'musik', label: 'Музыка', icon: Music }
]

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2.5 border-b border-line px-[18px] py-4', className)}>
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}

function ClipHeader({ clip, index }: { clip: Clip; index: number }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-[18px]">
      <span className="rounded-md bg-ink px-[7px] py-0.5 font-mono text-xs text-paper">{clipNumber(index)}</span>
      <span className="truncate text-[15px] font-semibold">{clip.title}</span>
      <span className="flex-1" />
      <span className="font-mono text-xs text-muted">{secLabel(clip.durationMs)}</span>
    </div>
  )
}

const VIDEO_CAMERA_OPTIONS = [
  { value: 'static' as const, label: 'Без движения (как в видео)' },
  ...CAMERA_PRESETS.filter((p) => p.id !== 'static').map((p) => ({ value: p.id, label: p.label }))
]

function ClipTab({ clip, index }: { clip: Clip; index: number }) {
  const { assets, jobs, updateClip, flush } = useProject()
  const { toast } = useApp()
  const image = clip.imageAssetId ? assets[clip.imageAssetId] : null
  const video = clip.videoAssetId ? assets[clip.videoAssetId] : null
  const videoJob = jobFor(jobs, 'video', { clipId: clip.id })
  const videoCamera = clip.videoCamera ?? 'static'
  // A camera change plays the clip in the preview at once, without moving the playhead.
  const audition = (): void => useAudition.getState().start({ kind: 'clip', clipId: clip.id })
  const setCamera = (patch: Partial<Clip>): void => {
    updateClip(clip.id, patch)
    audition()
  }
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await flush()
      await fn()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <ClipHeader clip={clip} index={index} />
      {clip.motionType === 'video' ? (
        <Section title="AI-видео">
          {video ? (
            <p className="text-[13px] text-ink-2">
              В этом клипе видео{' '}
              {video.provider === 'flow'
                ? 'из Google Flow'
                : video.model === 'local/infinitetalk'
                  ? '«Говорящая голова» (локально)'
                  : video.provider === 'comfyui' || video.provider === 'local'
                    ? 'с этого компьютера'
                    : 'от Higgsfield'}
              .
            </p>
          ) : (
            <p className="text-[13px] text-ink-2">Видео ещё не создано. Пока его нет, в превью стоит картинка.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={video ? 'secondary' : 'accent'}
              icon={<Clapperboard className="size-4" />}
              loading={isRunning(videoJob)}
              disabled={!image}
              onClick={() => void run(() => window.api.generate.clipVideo(clip.id))}
            >
              {video ? 'Пересоздать видео' : 'Создать видео'}
            </Button>
            <Button size="sm" icon={<Move className="size-4" />} onClick={() => updateClip(clip.id, { motionType: 'camera' })}>
              Вернуть движение камеры
            </Button>
          </div>
          {isRunning(videoJob) && (
            <span className="text-xs text-sun-ink">
              {videoJob!.message ?? 'Обработка'} {Math.round(videoJob!.progress * 100)}%
            </span>
          )}
          <div className="mt-1 flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink-2">Движение камеры поверх видео</span>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
              <Select
                label="Движение камеры поверх видео"
                size="sm"
                value={videoCamera}
                onChange={(v) => setCamera({ videoCamera: v })}
                options={VIDEO_CAMERA_OPTIONS}
              />
              <Select
                label="Сила движения поверх видео"
                size="sm"
                value={clip.videoStrength ?? 'halus'}
                disabled={videoCamera === 'static'}
                onChange={(v) => setCamera({ videoStrength: v })}
                options={MOTION_STRENGTHS.map((m) => ({ value: m.id, label: m.label }))}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              AI-видео уже движется само. Добавьте наезд или сдвиг, если нужен эффект камеры поверх.
            </p>
            <Button size="sm" variant="ghost" className="self-start" icon={<Play className="size-4" />} onClick={audition}>
              Смотреть движение
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Анимация камеры">
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
            <Select
              label="Движение камеры"
              size="sm"
              value={clip.cameraPreset}
              onChange={(v) => setCamera({ cameraPreset: v })}
              options={CAMERA_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <Select
              label="Сила движения"
              size="sm"
              value={clip.motionStrength}
              onChange={(v) => setCamera({ motionStrength: v })}
              options={MOTION_STRENGTHS.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Play className="size-4" />} disabled={!image} onClick={audition}>
              Смотреть движение
            </Button>
            <Button
              size="sm"
              icon={<Film className="size-4" />}
              disabled={!image}
              onClick={() => {
                updateClip(clip.id, { motionType: 'video' })
                if (!video) void run(() => window.api.generate.clipVideo(clip.id))
              }}
            >
              Сделать AI-видео
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted">Смените движение или его силу, и превью сразу покажет результат.</p>
        </Section>
      )}
    </>
  )
}

function DbSlider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="flex-1" />
      <span className="w-14 text-right font-mono">
        {value > 0 ? '+' : ''}
        {value} dB
      </span>
      <button
        type="button"
        onClick={() => onChange(0)}
        disabled={value === 0}
        className="text-xs font-semibold text-accent-dark hover:underline disabled:invisible"
      >
        Сбросить
      </button>
    </div>
  )
}

/** Which part of the take plays in the clip, and what the clip's end cuts off. */
function VoiceTrim({ clip, voice }: { clip: Clip; voice: Asset }) {
  const { updateClip, assets } = useProject()
  const span = voiceSpan(clip, voice.durationMs ?? UNKNOWN_AUDIO_MS)
  const trimmed = (clip.voiceInMs ?? 0) > 0 || clip.voiceOutMs != null || (clip.voiceStartMs ?? 0) > 0
  const cutMs = span.lengthMs - span.playMs
  const video = clip.motionType === 'video' && clip.videoAssetId ? assets[clip.videoAssetId] : null
  const room = video?.durationMs ? video.durationMs - (clip.mediaInMs ?? 0) : Infinity
  const needed = span.startMs + span.lengthMs + 300
  if (!trimmed && cutMs <= 30) return null
  return (
    <Section title="Обрезка голоса">
      {cutMs > 30 && (
        <>
          <p className="text-xs leading-relaxed text-bad-ink">
            Конец голоса ({secLabel(cutMs)}) обрезан: клип короче закадрового текста.
          </p>
          {needed <= room && (
            <Button size="sm" className="self-start" onClick={() => updateClip(clip.id, { durationMs: needed })}>
              Удлинить клип до {secLabel(needed)}
            </Button>
          )}
        </>
      )}
      {trimmed && (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Звучит отрезок записи с {secLabel(span.inMs)} до {secLabel(span.inMs + span.lengthMs)}, вступает через {secLabel(span.startMs)} после начала клипа.
          </p>
          <Button size="sm" variant="ghost" className="self-start" onClick={() => updateClip(clip.id, { voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 })}>
            Вернуть голос целиком
          </Button>
        </>
      )}
    </Section>
  )
}

/** The narration of one clip: its text, voice, and volume (opened from the TTS track or the Suara tab). */
function VoiceTab({ clip, index }: { clip: Clip; index: number }) {
  const { project, assets, jobs, updateClip, updateEditor } = useProject()
  const narration = useNarration()
  if (!project) return null
  const voice = clip.audioAssetId ? assets[clip.audioAssetId] : null
  const stale = !!voice && (voice.prompt ?? '').trim() !== clip.narration.trim()
  const voiceId = typeof voice?.meta.voice === 'string' ? voice.meta.voice : ''
  const voiceName = voiceId && voice?.provider === 'gemini' ? geminiVoiceName(voiceId) : voiceId
  return (
    <>
      <ClipHeader clip={clip} index={index} />
      <Section title="Закадровый голос">
        <p className="text-[13px] leading-relaxed text-ink-2">{clip.narration || 'Текста пока нет.'}</p>
        {/* Voices come from one take of the whole script, so a change is fixed by re-recording that take. */}
        {narration.running ? (
          <span className="text-xs text-sun-ink">Записываем закадровый голос…</span>
        ) : !voice || stale ? (
          <div className="flex flex-col items-start gap-2">
            <span className="text-xs text-ink-2">{voice ? 'Текст изменился после записи голоса.' : 'У этого клипа пока нет голоса.'}</span>
            <Button size="sm" variant="accent" icon={<Volume2 className="size-4" />} onClick={() => void narration.start()}>
              {narration.voiced ? 'Перезаписать голос' : 'Записать голос'}
            </Button>
          </div>
        ) : (
          <>
            <span className="text-xs text-muted">
              {[voiceName && `Голос ${voiceName}`, secLabel(voice.durationMs ?? clip.durationMs), voice.meta.estimatedTimings && 'тайминг субтитров примерный']
                .filter(Boolean)
                .join(' · ')}
            </span>
            <StressFix clipId={clip.id} narration={clip.narration} busy={isRunning(jobFor(jobs, 'tts', { clipId: clip.id }))} />
          </>
        )}
      </Section>
      {voice && (
        <Section title="Громкость клипа">
          <DbSlider label="Громкость голоса в клипе" value={clip.voiceGainDb ?? 0} min={-12} max={12} onChange={(v) => updateClip(clip.id, { voiceGainDb: v })} />
          <p className="text-xs leading-relaxed text-muted">Прибавьте, если голос здесь тише, чем в других клипах.</p>
        </Section>
      )}
      {voice && <VoiceTrim clip={clip} voice={voice} />}
      <Section title="Громкость всего голоса" className="border-b-0">
        <DbSlider label="Громкость всего голоса" value={project.editor.voiceVolumeDb ?? 0} min={-20} max={6} onChange={(v) => updateEditor({ voiceVolumeDb: v })} />
        <p className="text-xs leading-relaxed text-muted">
          Баланс голоса и фоновой музыки. При экспорте итоговая громкость всё равно подгоняется под стандарт YouTube, если эта опция включена.
        </p>
      </Section>
    </>
  )
}

/** The words the caption editor is changing: in one voice asset, starting at `from`, `count` long. */
type CaptionRange = { key: string; from: number; count: number }

/**
 * Fixes the text of the caption chunk picked on the timeline. Typing saves on its own after a short pause and
 * the preview follows; the words keep their time span. The editor owns the words it was opened on (and as
 * many as were typed since), so re-chunking after a save never makes it overwrite the next caption.
 */
function CaptionTextEditor() {
  const selected = useCaptionUi((s) => s.selected)
  const select = useCaptionUi((s) => s.select)
  const { items, chunks } = useTimeline()
  const { toast } = useApp()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const range = useRef<CaptionRange | null>(null)
  const pending = useRef<{ range: CaptionRange; value: string; timer: number } | null>(null)
  // Saves run one after another, each on the word list the previous one produced.
  const chain = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef(new Map<string, WordTiming[]>())

  const save = (r: CaptionRange, value: string): void => {
    const tokens = value.split(/\s+/).filter(Boolean)
    // An emptied field keeps the last text until something new is typed.
    if (!tokens.length) return
    chain.current = chain.current.then(async () => {
      const words = latest.current.get(r.key) ?? useProject.getState().assets[r.key]?.meta.words ?? []
      setStatus('saving')
      try {
        const fresh = await window.api.assets.setWords(r.key, replaceCaptionWords(words, r.from, r.count, tokens.join(' ')))
        latest.current.set(r.key, fresh.meta.words ?? [])
        // A chunk opened since then, later in the same clip, moves with the changed word count.
        const now = range.current
        if (now && now !== r && now.key === r.key && now.from > r.from) now.from += tokens.length - r.count
        r.count = tokens.length
        setStatus('saved')
      } catch (e) {
        toast('error', errorText(e))
        setStatus('idle')
      }
    })
  }

  const flush = (): void => {
    const p = pending.current
    if (!p) return
    window.clearTimeout(p.timer)
    pending.current = null
    save(p.range, p.value)
  }

  // A newly picked chunk takes over the editor; the editor's own saves never reset what is being typed.
  useEffect(() => {
    flush()
    latest.current.clear()
    const c = selected ? chunks.find((x) => x.source?.key === selected.key && x.source.from === selected.from) : undefined
    range.current = c?.source ? { ...c.source } : null
    setText(c ? c.words.map((w) => w.text).join(' ') : '')
    setStatus('idle')
    return flush
  }, [selected?.key, selected?.from])

  const r = range.current
  if (!selected || !r) return null
  const item = items.find((it) => it.audio?.id === r.key)
  const words = latest.current.get(r.key) ?? item?.audio?.meta.words ?? []
  const first = words[r.from]
  const last = words[r.from + r.count - 1]

  return (
    <Section title="Текст субтитров" className="bg-sun-soft/40">
      <div className="flex items-center gap-2 text-xs">
        {item && first && last && (
          <span className="font-mono text-muted">
            {timecode(item.start + first.start)} – {timecode(item.start + last.end)}
          </span>
        )}
        <span className="flex-1" />
        <span className={cx(status === 'saved' ? 'text-ok-ink' : 'text-muted')}>
          {status === 'saving' ? 'Сохраняем…' : status === 'saved' ? 'Сохранено' : ''}
        </span>
      </div>
      <AutoTextarea
        minRows={2}
        maxHeight={160}
        autoFocus
        value={text}
        onChange={(ev) => {
          const value = ev.target.value
          setText(value)
          if (pending.current) window.clearTimeout(pending.current.timer)
          pending.current = { range: r, value, timer: window.setTimeout(flush, 400) }
        }}
        onBlur={flush}
        aria-label="Текст субтитров"
        className={cx(inputCls, 'py-2 text-sm leading-relaxed')}
      />
      <p className="text-xs leading-relaxed text-muted">
        Правки сохраняются сразу и видны в превью. Время показа не меняется; если слов стало больше или меньше, время делится между ними поровну.
        Повторная синхронизация через Whisper вернёт текст из сценария.
      </p>
      <Button size="sm" variant="ghost" className="self-start" onClick={() => select(null)}>
        Готово
      </Button>
    </Section>
  )
}

/** Whether caption words follow the real voice, and a way to fix the ones that are still estimates. */
function CaptionTiming() {
  const { project, clips, assets, jobs, flush } = useProject()
  const { toast, go } = useApp()
  const [whisper, setWhisper] = useState<boolean | null>(null)
  useEffect(() => {
    void window.api.whisper.status().then((s) => setWhisper(s.state === 'ready'))
    return window.api.on.whisper((s) => setWhisper(s.state === 'ready'))
  }, [])
  if (!project) return null
  const voiced = clips.filter((c) => c.audioAssetId && assets[c.audioAssetId])
  const estimated = voiced.filter((c) => captionNeedsSync(assets[c.audioAssetId!])).length
  const canResync = voiced.some((c) => assets[c.audioAssetId!]?.provider !== 'elevenlabs')
  const job = jobFor(jobs, 'align', {})
  const running = isRunning(job)

  const sync = async (mode: 'stale' | 'all' = 'stale'): Promise<void> => {
    try {
      await flush()
      await window.api.generate.syncCaptions(project.id, mode)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <Section title="Тайминг субтитров">
      {!voiced.length ? (
        <p className="text-[13px] text-ink-2">Субтитры появятся после записи голоса.</p>
      ) : running ? (
        <span className="text-[13px] text-sun-ink">
          {job!.message ?? 'Синхронизируем'} {Math.round(job!.progress * 100)}%
        </span>
      ) : estimated === 0 ? (
        <>
          <p className="text-[13px] text-ok-ink">Все субтитры идут точно по голосу.</p>
          {whisper && canResync && (
            <Button size="sm" variant="ghost" className="self-start" icon={<AudioLines className="size-4" />} onClick={() => void sync('all')}>
              Синхронизировать заново
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-2">
            {estimated} {plural(estimated, 'клип не синхронизирован', 'клипа не синхронизированы', 'клипов не синхронизированы')} с голосом, поэтому субтитры могут спешить или отставать.
          </p>
          {whisper ? (
            <Button size="sm" className="self-start" icon={<AudioLines className="size-4" />} onClick={() => void sync()}>
              Синхронизировать через Whisper
            </Button>
          ) : (
            <p className="text-[13px] text-ink-2">
              Скачайте модель Whisper Small в разделе{' '}
              <button
                type="button"
                onClick={async () => {
                  await flush()
                  go({ name: 'settings', back: { name: 'project', id: project.id } })
                }}
                className="font-semibold text-accent-dark hover:underline"
              >
                Настройки
              </button>{' '}
              чтобы подогнать субтитры под голос.
            </p>
          )}
        </>
      )}
    </Section>
  )
}

function CaptionTab() {
  const { project, clips, assets, selectedClipId, updateEditor } = useProject()
  if (!project) return null
  const e = project.editor
  // The preview sits on the selected clip's picture (or the first clip with one), with its own words.
  const clip = clips.find((c) => c.id === selectedClipId && c.imageAssetId) ?? clips.find((c) => c.imageAssetId) ?? null
  const image = clip?.imageAssetId ? (assets[clip.imageAssetId]?.url ?? null) : null
  return (
    <>
      <CaptionSettings
        look={e}
        onChange={updateEditor}
        aspect={project.aspectRatio}
        image={image}
        text={clip?.narration.replace(/<[^>]+>/g, ' ')}
        previewWidth={project.aspectRatio === '9:16' ? 180 : 290}
      />
      {e.captionStyle !== 'none' && (
        <>
          <CaptionTextEditor />
          <CaptionTiming />
        </>
      )}
    </>
  )
}

function PromptField({ label, hint, value, rows, onChange }: { label: string; hint?: string; value: string; rows: number; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void window.api.app.copyText(value).then(() => setCopied(true))}
          className={cx('inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold', copied ? 'text-ok-ink' : 'text-accent-dark hover:bg-accent-soft')}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <AutoTextarea
        minRows={rows}
        maxHeight={220}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        aria-label={label}
        className={cx(inputCls, 'py-2 text-[13px] leading-relaxed')}
      />
    </div>
  )
}

const MUSIC_SITES = [
  { name: 'Suno', url: 'https://suno.com/create' },
  { name: 'Udio', url: 'https://www.udio.com/create' },
  { name: 'ElevenLabs Music', url: 'https://elevenlabs.io/app/music' }
]

/** Writes a prompt for background music that suits this story, to use in Suno or another music AI. */
function MusicPromptSection() {
  const { project, updateEditor, flush } = useProject()
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  if (!project) return null
  const mp = project.editor.musicPrompt ?? null
  const set = (patch: Partial<NonNullable<typeof mp>>): void => {
    if (mp) updateEditor({ musicPrompt: { ...mp, ...patch } })
  }
  const make = async (): Promise<void> => {
    setBusy(true)
    try {
      await flush()
      const r = await window.api.story.musicPrompt(project.id)
      updateEditor({ musicPrompt: r })
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Промпт для AI-музыки">
      <p className="text-[13px] leading-relaxed text-ink-2">
        {mp?.reason || 'Составьте промпт фоновой музыки под эту историю и вставьте его в Suno или другой музыкальный AI. Готовый трек выберите кнопкой «Выбрать музыку» ниже.'}
      </p>
      {mp && (
        <>
          <PromptField label="Style of Music" hint="поле стиля в Suno" value={mp.style} rows={3} onChange={(v) => set({ style: v })} />
          <PromptField label="Exclude styles" hint="чего избегать" value={mp.exclude} rows={1} onChange={(v) => set({ exclude: v })} />
          <PromptField label="Название трека" value={mp.title} rows={1} onChange={(v) => set({ title: v })} />
          <PromptField label="Описание" hint="Udio, ElevenLabs и др." value={mp.description} rows={5} onChange={(v) => set({ description: v })} />
          <p className="text-xs text-muted">
            Выберите режим Instrumental. Видео идёт около {secLabel(mp.durationSec * 1000)}; при экспорте музыка сама повторится или обрежется по длине и плавно затихнет в конце.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MUSIC_SITES.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => void window.api.app.openExternal(s.url)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-2 px-3 text-xs font-semibold text-ink-2 hover:border-ink-2 hover:text-ink"
              >
                Открыть {s.name}
                <ExternalLink className="size-3.5" />
              </button>
            ))}
          </div>
        </>
      )}
      <Button size="sm" variant={mp ? 'secondary' : 'accent'} className="self-start" icon={<Sparkles className="size-4" />} loading={busy} onClick={() => void make()}>
        {mp ? 'Составить заново' : 'Составить промпт'}
      </Button>
    </Section>
  )
}

type MusicSource = 'api' | 'chrome' | 'ace-step' | 'stable-audio-3' | 'minimax-music-3'
const MUSIC_SOURCES: { id: MusicSource; label: string; title: string; local?: boolean }[] = [
  { id: 'api', label: 'Gemini API', title: 'По ключу Gemini, около 20 секунд' },
  { id: 'chrome', label: 'Gemini в Chrome', title: 'Через gemini.google.com в Chrome, по вашей подписке, около минуты' },
  { id: 'ace-step', label: 'ACE-Step', title: 'ACE-Step 1.5 на этом компьютере: по стилю проекта, около минуты', local: true },
  { id: 'stable-audio-3', label: 'Stable Audio', title: 'Stable Audio 3 на этом компьютере: по описанию, стерео', local: true },
  { id: 'minimax-music-3', label: 'MiniMax', title: 'MiniMax Music 3 на этом компьютере: целая композиция до 5 минут', local: true }
]

export function MusicTab() {
  const { project, assets, updateEditor } = useProject()
  const { toast } = useApp()
  const [source, setSource] = useState<MusicSource>('api')
  // Local music models that are installed (Настройки › Локальные модели); the others are offered greyed out.
  const [localReady, setLocalReady] = useState<Record<string, boolean>>({})
  useEffect(() => {
    void window.api.localModels
      .inventory()
      .then((inv) => setLocalReady(Object.fromEntries(inv.packs.map((p) => [p.id, p.state === 'ready']))))
      .catch(() => undefined)
  }, [])
  const [making, setMaking] = useState(false)
  if (!project) return null
  const e = project.editor
  const music = e.musicAssetId ? assets[e.musicAssetId] : null
  const pick = async (): Promise<void> => {
    try {
      const a = await window.api.assets.pickMusic(project.id)
      if (a) {
        useProject.getState().addAsset(a)
        updateEditor({ musicAssetId: a.id })
      }
    } catch (err) {
      toast('error', errorText(err))
    }
  }
  const generate = async (): Promise<void> => {
    setMaking(true)
    try {
      await useProject.getState().flush()
      const a = await window.api.music.generate(project.id, source)
      useProject.getState().addAsset(a)
      updateEditor({ musicAssetId: a.id })
      toast('success', `Музыка готова и стоит в проекте (${MUSIC_SOURCES.find((s) => s.id === source)?.label})`)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setMaking(false)
    }
  }
  return (
    <>
      <MusicPromptSection />
      <Section title="Сгенерировать музыку">
        <p className="text-[13px] leading-relaxed text-ink-2">
          Инструментальный трек по промпту выше; если промпта нет, он составится сам. Готовый трек сразу встанет в проект. Gemini — через ключ или Chrome,
          ACE-Step и Stable Audio — на этом компьютере, бесплатно.
        </p>
        <Segmented
          size="sm"
          value={source}
          onChange={setSource}
          options={MUSIC_SOURCES.map((s) => ({
            id: s.id,
            label: s.label,
            title: s.local && !localReady[s.id] ? `${s.title}. Не установлено — «Настройки › Локальные модели»` : s.title
          }))}
          className="self-start"
        />
        <Button size="sm" variant="accent" className="self-start" icon={<Sparkles className="size-4" />} loading={making} onClick={() => void generate()}>
          {making ? `${MUSIC_SOURCES.find((s) => s.id === source)?.label} сочиняет…` : 'Сгенерировать музыку'}
        </Button>
        {MUSIC_SOURCES.find((s) => s.id === source)?.local && !localReady[source] && (
          <p className="text-xs text-sun-ink">Модель не установлена: скачайте её в «Настройки › Локальные модели» — около 10–20 ГБ, один раз.</p>
        )}
        {source === 'chrome' && <p className="text-xs text-muted">Откроется отдельная вкладка Gemini и закроется сама. В Chrome нужен вход в Google и подписка с «Созданием музыки».</p>}
      </Section>
      <Section title="Фоновая музыка">
        {music ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[#9CC596] bg-ok-soft px-3 py-2.5 text-[13px] text-ok-ink">
            <Music className="size-4 shrink-0" />
            <span className="flex-1 truncate">{music.prompt}</span>
            <button type="button" aria-label="Убрать музыку" onClick={() => updateEditor({ musicAssetId: null })} className="hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">Музыки пока нет. Выберите файл MP3 или WAV на компьютере.</p>
        )}
        <Button size="sm" className="self-start" icon={<Music className="size-4" />} onClick={() => void pick()}>
          {music ? 'Заменить музыку с диска' : 'Выбрать музыку с диска'}
        </Button>
      </Section>
      <Section title="Все треки проекта">
        {/* Generated, uploaded and folder tracks stay with the project: switch between them in one click. */}
        {Object.values(assets).filter((a) => a.kind === 'music').length ? (
          <div className="flex flex-col gap-1.5">
            {Object.values(assets)
              .filter((a) => a.kind === 'music')
              .map((a) => (
                <div key={a.id} className={cx('flex flex-col gap-1.5 rounded-lg border px-2.5 py-2', a.id === e.musicAssetId ? 'border-accent bg-accent-soft' : 'border-line')}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <input
                      type="radio"
                      checked={a.id === e.musicAssetId}
                      onChange={() => updateEditor({ musicAssetId: a.id })}
                      aria-label={`Играть в видео: ${a.prompt || 'трек'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <EditableName
                        value={a.prompt || 'Без названия'}
                        onSave={async (v) => {
                          await window.api.assets.rename(a.id, v)
                          useProject.getState().addAsset({ ...a, prompt: v })
                        }}
                      />
                    </span>
                    {a.durationMs ? <span className="shrink-0 text-xs text-muted">{Math.round(a.durationMs / 1000)} с</span> : null}
                  </div>
                  <audio src={a.url} controls preload="none" className="h-7 w-full" />
                </div>
              ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">Здесь появятся сгенерированные и загруженные треки, а также музыка папки проекта.</p>
        )}
        {music && (
          <p className="text-xs leading-relaxed text-muted">Потяните края музыки на таймлайне, чтобы задать начало и конец, или перетащите её целиком.</p>
        )}
        {music && ((e.musicStartMs ?? 0) > 0 || (e.musicInMs ?? 0) > 0 || e.musicEndMs != null) && (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => updateEditor({ musicStartMs: 0, musicInMs: 0, musicEndMs: null })}>
            Музыка на всё видео
          </Button>
        )}
      </Section>
      {music && (
        <Section title="Громкость" className="border-b-0">
          <label className="flex items-center gap-3 text-[13px]">
            <input
              type="range"
              min={-36}
              max={-3}
              step={1}
              value={e.musicVolumeDb}
              onChange={(ev) => updateEditor({ musicVolumeDb: Number(ev.target.value) })}
              aria-label="Громкость музыки"
              className="flex-1"
            />
            <span className="w-14 text-right font-mono">{e.musicVolumeDb} dB</span>
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">Тише под голос</p>
              <p className="text-[13px] text-muted">Музыка сама приглушается, когда звучит голос</p>
            </div>
            <Switch on={e.duckMusic} onChange={(v) => updateEditor({ duckMusic: v })} label="Приглушать музыку под голос" />
          </div>
        </Section>
      )}
    </>
  )
}

function TransitionView({ id }: { id: string | null }) {
  const clips = useProject((s) => s.clips)
  const i = clips.findIndex((c) => c.id === id)
  if (i < 0 || i >= clips.length - 1) return <p className="p-5 text-sm text-muted">Щёлкните круглую кнопку между клипами на таймлайне, чтобы настроить переход.</p>
  return <TransitionPanel clip={clips[i]} next={clips[i + 1]} index={i} />
}

export function Inspector({
  tab,
  clip,
  index,
  total,
  transitionId
}: {
  tab: InspectorTab
  clip: Clip | null
  index: number
  total: number
  transitionId: string | null
}) {
  return (
    <aside className="scroll-thin flex min-h-0 flex-col overflow-y-auto border-l border-line bg-surface">
      {tab === 'klip' && (clip ? <ClipTab clip={clip} index={index} /> : <p className="p-5 text-sm text-muted">Выберите клип на таймлайне.</p>)}
      {tab === 'suara' && (clip ? <VoiceTab clip={clip} index={index} /> : <p className="p-5 text-sm text-muted">Выберите голос клипа на таймлайне.</p>)}
      {tab === 'caption' && <CaptionTab />}
      {tab === 'overlay' && <OverlayPanel total={total} />}
      {tab === 'musik' && <MusicTab />}
      {tab === 'transisi' && <TransitionView id={transitionId} />}
    </aside>
  )
}
