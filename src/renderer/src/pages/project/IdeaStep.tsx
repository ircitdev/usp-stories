import { AutoTextarea } from '../../components/AutoTextarea'
import { useEffect, useRef, useState } from 'react'
import { Bot, Play, Sparkles, Square } from 'lucide-react'
import { getImageModel } from '@shared/higgsfield'
import { DURATIONS, LANGUAGES, clipCountFor, llmName } from '@shared/models'
import { getStyle } from '@shared/styles'
import type { KeyStatus, LlmProvider, TtsProvider, VoiceOption } from '@shared/types'
import { BasePromptToggle } from '../../components/BasePromptToggle'
import { Select } from '../../components/Select'
import { StylePicker } from '../../components/StylePicker'
import { Button, Chip, Field, Segmented, confirmDialog, cx } from '../../components/ui'
import { errorText, plural } from '../../lib/format'
import { geminiPreview } from '../../lib/voicePreviews'
import { TTS_NAMES, ttsReadiness, usableTts } from '../../lib/keys'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { ModelSection } from './ModelSection'

/** One sample plays at a time, from the list rows or the button beside the picker. */
function usePreviewPlayer(): { playing: string | null; toggle: (id: string, url: string) => void } {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  return {
    playing,
    toggle: (id, url) => {
      audio.current?.pause()
      if (playing === id) return setPlaying(null)
      const a = new Audio(url)
      a.onended = () => setPlaying(null)
      audio.current = a
      setPlaying(id)
      void a.play().catch(() => setPlaying(null))
    }
  }
}

function VoicePicker({ provider, value, onChange }: { provider: TtsProvider; value: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const player = usePreviewPlayer()

  useEffect(() => {
    setVoices(null)
    setError(null)
    window.api.settings
      .voices(provider)
      .then((list) => {
        // Gemini samples ship with the app; ElevenLabs sends its own preview links.
        const v = provider === 'gemini' ? list.map((x) => ({ ...x, previewUrl: x.previewUrl ?? geminiPreview(x.id, x.name) })) : list
        setVoices(v)
        if (!v.some((x) => x.id === value) && v[0]) onChange(v[0].id)
      })
      .catch((e) => setError(errorText(e)))
  }, [provider])

  const urlOf = (id: string): string | null => voices?.find((v) => v.id === id)?.previewUrl ?? null
  const current = voices?.find((v) => v.id === value)

  const playButton = (id: string, size: 'row' | 'field') => {
    const url = urlOf(id)
    if (!url) return null
    const on = player.playing === id
    return (
      <button
        type="button"
        aria-label={on ? 'Остановить пример голоса' : 'Послушать пример голоса'}
        title={on ? 'Остановить' : 'Послушать пример'}
        onClick={() => player.toggle(id, url)}
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full border transition-colors',
          size === 'row' ? 'size-7' : 'size-12 rounded-xl',
          on ? 'border-accent bg-accent text-white' : 'border-line-2 bg-surface text-ink hover:border-ink-2'
        )}
      >
        {on ? <Square className="size-3.5" fill="currentColor" /> : <Play className="ml-px size-3.5" fill="currentColor" />}
      </button>
    )
  }

  if (error) return <p className="flex h-12 flex-1 items-center rounded-xl bg-bad-soft px-3.5 text-[13px] text-bad-ink">{error}</p>
  return (
    <>
      <Select
        label="Голос рассказчика"
        size="lg"
        value={value}
        onChange={onChange}
        disabled={!voices}
        className="flex-1"
        menuWidth={380}
        renderAction={(o) => playButton(o.value, 'row')}
        options={
          voices
            ? voices.map((v) =>
                // Gemini tones are short; ElevenLabs labels are longer, so they go on a second line.
                provider === 'gemini' ? { value: v.id, label: v.name, hint: v.description || undefined } : { value: v.id, label: v.name, note: v.description || undefined }
              )
            : [{ value, label: 'Загружаем список голосов…' }]
        }
      />
      {current && playButton(current.id, 'field')}
    </>
  )
}

export function IdeaStep() {
  const { project, clips, updateProject, flush, load } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState(false)
  const [writer, setWriter] = useState<{ provider: LlmProvider; model: string } | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])

  useEffect(() => {
    void window.api.settings.get().then((s) => setWriter({ provider: s.llmProvider, model: s.llmModels[s.llmProvider] }))
    void window.api.settings.keys().then(setKeys)
  }, [])

  // Before any narration exists, move to a narrator service that has a working key.
  const hasVoice = clips.some((c) => c.audioAssetId)
  useEffect(() => {
    if (!project || !keys.length || hasVoice) return
    const use = usableTts(project.ttsProvider, keys)
    if (use !== project.ttsProvider) updateProject({ ttsProvider: use, ttsVoice: use === 'gemini' ? 'Charon' : '' })
  }, [keys, project?.id])

  if (!project) return null
  const ready = ttsReadiness(keys)
  const blocked = keys.length ? (['voicestudio', 'gemini', 'elevenlabs'] as const).filter((p) => !ready[p].ok) : []
  const openSettings = async (): Promise<void> => {
    await flush()
    go({ name: 'settings', back: { name: 'project', id: project.id } })
  }

  const clipCount = clipCountFor(project.durationSec)
  const perClip = Math.round(project.durationSec / clipCount)
  const model = getImageModel(project.imageModel)

  const compose = async (): Promise<void> => {
    if (!project.synopsis.trim()) {
      toast('error', 'Сначала опишите идею или синопсис.')
      return
    }
    if (clips.length) {
      const ok = await confirmDialog({
        title: 'Пересобрать сценарий?',
        body: `В проекте уже ${clips.length} ${plural(clips.length, ['сцена', 'сцены', 'сцен'])}. Пересборка заменит все сцены вместе со сценарием. Персонажи останутся, а старые картинки и озвучка сохранятся в истории, но к сценам больше не будут привязаны.`,
        confirm: 'Пересобрать'
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      await flush()
      const bundle = await window.api.story.script(project.id)
      load(bundle)
      toast('success', `Готово: ${bundle.clips.length} ${plural(bundle.clips.length, ['сцена', 'сцены', 'сцен'])}. Прочитайте и поправьте сценарий.`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-full">
      <div className="scroll-thin h-full overflow-y-auto pb-28">
        <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)_540px] gap-10 px-14 pt-8">
          <div className="flex flex-col gap-[22px]">
            <div>
              <p className="text-[13px] font-semibold text-accent">Шаг 1 из 4</p>
              <h1 className="mt-1.5 font-display text-[40px] font-bold leading-tight tracking-[-0.02em]">Расскажите идею</h1>
              <p className="mt-2 text-[15px] text-ink-2">
                Назовите героев, место и чем всё закончится. Чем точнее идея, тем аккуратнее ИИ разложит её на клипы.
              </p>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-ink bg-surface px-[18px] pb-3 pt-4 shadow-ink-md">
              <label htmlFor="sinopsis" className="text-[13px] font-semibold text-ink-2">
                Идея или синопсис
              </label>
              <AutoTextarea
                id="sinopsis"
                minRows={5}
                maxHeight={640}
                value={project.synopsis}
                maxLength={4000}
                onChange={(e) => updateProject({ synopsis: e.target.value })}
                placeholder="Пятеро подростков из Казани приезжают в Москву на медиа-тур. В первый же день их пускают в студию телеканала…"
                className="resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted/70"
              />
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Совет: укажите и настроение — напряжённое, смешное или трогательное.</span>
                <span className="font-mono">{project.synopsis.length.toLocaleString('ru-RU')} / 4000</span>
              </div>
            </div>

            <BasePromptToggle />

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Длительность видео</span>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Chip key={d.sec} on={project.durationSec === d.sec} onClick={() => updateProject({ durationSec: d.sec })} className="h-10 px-4">
                    {d.label}
                  </Chip>
                ))}
              </div>
              <span className="text-[13px] text-muted">
                Около {clipCount} {plural(clipCount, ['клипа', 'клипов', 'клипов'])}, примерно по {perClip} с. Итоговая длительность зависит от длины закадрового голоса.
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
              <Field label="Язык сценария и озвучки">
                <Select
                  label="Язык сценария и озвучки"
                  size="lg"
                  value={project.language}
                  onChange={(v) => updateProject({ language: v })}
                  options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Формат</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: '16:9', label: '16:9', sub: 'YouTube', w: 26, h: 15 },
                      { id: '9:16', label: '9:16', sub: 'Shorts, Reels, TikTok', w: 13, h: 22 }
                    ] as const
                  ).map((f) => {
                    const on = project.aspectRatio === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => updateProject({ aspectRatio: f.id })}
                        className={cx(
                          'flex h-12 items-center gap-2.5 rounded-xl px-3 text-left',
                          on ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 bg-surface hover:border-ink-2'
                        )}
                      >
                        <span className="flex w-[26px] justify-center">
                          <span className="rounded-[3px] border-[1.8px] border-ink" style={{ width: f.w, height: f.h }} />
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-semibold">{f.label}</span>
                          <span className="text-xs text-ink-2">{f.sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Голос рассказчика</span>
              <div className="flex items-center gap-2">
                <Segmented
                  value={project.ttsProvider}
                  onChange={(v) => updateProject({ ttsProvider: v, ttsVoice: v === 'gemini' ? 'Charon' : '' })}
                  options={(['voicestudio', 'gemini', 'elevenlabs'] as const).map((p) => ({
                    id: p,
                    label: TTS_NAMES[p],
                    disabled: blocked.includes(p),
                    title: ready[p].reason ?? undefined
                  }))}
                />
                <VoicePicker provider={project.ttsProvider} value={project.ttsVoice} onChange={(v) => updateProject({ ttsVoice: v })} />
              </div>
              {blocked.length > 0 && (
                <span className="text-[13px] text-muted">
                  {blocked.length >= 2
                    ? 'Нет рабочего ключа для озвучки, поэтому голос пока не создать.'
                    : `${ready[blocked[0]].reason}, поэтому ${TTS_NAMES[blocked[0]]} пока недоступен.`}{' '}
                  <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
                    Открыть настройки
                  </button>
                </span>
              )}
            </div>

            <ModelSection
              project={project}
              clipCount={clipCount}
              perClip={perClip}
              onChange={(patch) => {
                updateProject(patch)
                // New projects start with the models picked last; resolution stays with this project.
                if (!('videoResolution' in patch)) void window.api.settings.set(patch)
              }}
            />
          </div>

          <aside className="flex flex-col gap-3.5 self-start rounded-[18px] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[22px] font-bold">Визуальный стиль</h2>
              <span className="text-[13px] text-muted">{getStyle(project.styleId).name}</span>
            </div>
            <p className="-mt-1.5 text-[13px] text-ink-2">Применяется ко всем картинкам проекта, включая листы персонажей.</p>
            <StylePicker value={project.styleId} onChange={(id) => updateProject({ styleId: id })} />
          </aside>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-4 border-t border-line bg-surface px-14">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            ± {clipCount} {plural(clipCount, ['сцена', 'сцены', 'сцен'])} · картинки {model.name}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Bot className="size-3.5" />
            Пишет {writer ? `${llmName(writer.provider)} · ` : ''}
            <span className={cx('font-mono', writer && !writer.model && 'text-accent-dark')}>{writer ? writer.model || 'модель не выбрана' : '…'}</span>
            <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
              Сменить
            </button>
          </span>
        </div>
        <div className="flex-1" />
        {clips.length > 0 && !busy && (
          <Button size="lg" onClick={() => updateProject({ step: 2 })}>
            Открыть сценарий
          </Button>
        )}
        <Button variant="primary" size="lg" className="h-[50px]" loading={busy} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void compose()}>
          {clips.length ? 'Пересобрать сценарий' : 'Собрать сценарий'}
        </Button>
      </footer>
    </div>
  )
}
