import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { TRANSITIONS, TRANSITION_MAX_SEC, TRANSITION_MIN_SEC, transitionSecOf } from '@shared/motion'
import type { Clip, TransitionId } from '@shared/types'
import { Button, cx } from '../../../components/ui'
import { clipNumber } from '../../../lib/format'
import { useProject } from '../../../store/project'
import { useAudition } from './engine'
import { TRANSITION_ICONS, TRANSITION_NOTES, secondsLabel } from './TransitionButton'

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2.5 border-b border-line px-[18px] py-4', className)}>
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}

/**
 * The transition from a clip into the next one, opened from the round button on the timeline joint. While
 * it is open the preview loops that joint, so every pick, hover and length change can be seen right away.
 */
export function TransitionPanel({ clip, next, index }: { clip: Clip; next: Clip; index: number }) {
  const { clips, updateClip } = useProject()
  const start = useAudition((s) => s.start)
  const trying = useAudition((s) => (s.audition?.kind === 'transition' && s.audition.override ? s.audition.override.transition : null))
  const seconds = transitionSecOf(clip)
  const [picking, setPicking] = useState(false)
  const preview = (transition?: TransitionId): void => start({ kind: 'transition', clipId: clip.id, override: transition ? { transition } : undefined })

  useEffect(() => {
    preview()
    setPicking(false)
    return () => useAudition.getState().stop()
  }, [clip.id])

  const joints = clips.slice(0, -1)
  const allSame = joints.every((c) => c.transition === clip.transition && transitionSecOf(c) === seconds)

  // All the variants slide in over the panel, so the main panel stays short.
  if (picking)
    return (
      <div className="slide-in-right flex min-h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-[18px]">
          <button
            type="button"
            onClick={() => {
              setPicking(false)
              preview()
            }}
            className="flex items-center gap-1 text-[15px] font-semibold hover:text-accent-dark"
            aria-label="Назад к переходу"
          >
            <ChevronLeft className="size-5" /> Тип перехода
          </button>
          <span className="flex-1" />
          <span className="font-mono text-xs text-muted">
            {clipNumber(index)} → {clipNumber(index + 1)}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 px-[18px] py-4">
          <p className="text-xs leading-relaxed text-muted">Наведите курсор на вариант — он покажется в превью; щёлкните, чтобы выбрать.</p>
        <div className="grid grid-cols-2 gap-2" onMouseLeave={() => trying && preview()}>
          {TRANSITIONS.map((t) => {
            const Icon = TRANSITION_ICONS[t.id]
            const on = t.id === clip.transition
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onMouseEnter={() => (on ? trying && preview() : preview(t.id))}
                onClick={() => {
                  updateClip(clip.id, { transition: t.id })
                  preview()
                  setPicking(false)
                }}
                className={cx(
                  'flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-colors',
                  on ? 'border-ink bg-sun-soft' : trying === t.id ? 'border-ink-2 bg-paper' : 'border-line-2 hover:border-ink-2'
                )}
              >
                <span className={cx('flex size-8 items-center justify-center rounded-full border', on ? 'border-ink bg-sun' : 'border-line-2 bg-surface')}>
                  <Icon className="size-4" />
                </span>
                <span className={cx('text-sm', on && 'font-semibold')}>{t.label}</span>
                <span className="text-xs leading-snug text-muted">{TRANSITION_NOTES[t.id]}</span>
              </button>
            )
          })}
        </div>
        </div>
      </div>
    )

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-[18px]">
        <span className="text-[15px] font-semibold">Переход</span>
        <span className="flex-1" />
        <span className="font-mono text-xs text-muted">
          {clipNumber(index)} → {clipNumber(index + 1)}
        </span>
      </div>
      <Section title="Тип перехода">
        <p className="truncate text-[13px] text-ink-2" title={`${clip.title} → ${next.title}`}>
          {clip.title} → {next.title}
        </p>
        {(() => {
          const t = TRANSITIONS.find((x) => x.id === clip.transition) ?? TRANSITIONS[0]
          const Icon = TRANSITION_ICONS[t.id]
          return (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex items-center gap-3 rounded-xl border border-ink bg-sun-soft p-2.5 text-left hover:bg-sun-soft/70"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ink bg-sun">
                <Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-xs leading-snug text-muted">{TRANSITION_NOTES[t.id]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-accent-dark">
                Сменить <ChevronRight className="size-4" />
              </span>
            </button>
          )
        })()}
      </Section>
      {seconds > 0 && (
        <Section title="Длительность перехода">
          <label className="flex items-center gap-3 text-[13px]">
            <input
              type="range"
              min={TRANSITION_MIN_SEC}
              max={TRANSITION_MAX_SEC}
              step={0.1}
              value={seconds}
              onChange={(e) => updateClip(clip.id, { transitionMs: Math.round(Number(e.target.value) * 1000) })}
              onPointerUp={() => preview()}
              onKeyUp={() => preview()}
              aria-label="Длительность перехода"
              className="min-w-0 flex-1"
            />
            <span className="w-16 shrink-0 text-right font-mono">{secondsLabel(seconds)}</span>
          </label>
          <p className="text-xs leading-relaxed text-muted">Переход идёт в начале следующего клипа, поэтому длина видео не меняется.</p>
        </Section>
      )}
      <Section title="Превью" className="border-b-0">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Play className="size-4" />} onClick={() => preview()}>
            Повторить превью
          </Button>
          {!allSame && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => joints.forEach((c) => c.id !== clip.id && updateClip(c.id, { transition: clip.transition, transitionMs: clip.transitionMs }))}
            >
              Применить ко всем стыкам
            </Button>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted">Превью повторяется и не сдвигает таймлайн. Чтобы остановить, щёлкните по превью или по кнопке воспроизведения.</p>
      </Section>
    </>
  )
}
