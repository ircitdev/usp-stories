import type { PointerEvent } from 'react'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Blend,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  Circle,
  CircleDot,
  Clock,
  Droplets,
  Grid3x3,
  Maximize2,
  Moon,
  MoveLeft,
  Scissors,
  Sparkles,
  Sun
} from 'lucide-react'
import { TRANSITIONS, transitionSecOf } from '@shared/motion'
import type { Clip, TransitionId } from '@shared/types'
import { cx } from '../../../components/ui'

export const TRANSITION_ICONS: Record<TransitionId, typeof Blend> = {
  fade: Blend,
  slideleft: ChevronsLeft,
  zoomin: Maximize2,
  cut: Scissors,
  fadeblack: Moon,
  fadewhite: Sun,
  dissolve: Sparkles,
  hblur: Droplets,
  slideright: ChevronsRight,
  slideup: ChevronsUp,
  slidedown: ChevronsDown,
  smoothleft: MoveLeft,
  wipeleft: ArrowLeftToLine,
  wiperight: ArrowRightToLine,
  circleopen: CircleDot,
  circleclose: Circle,
  pixelize: Grid3x3,
  radial: Clock
}

export const TRANSITION_NOTES: Record<TransitionId, string> = {
  fade: 'Спокойный, подходит для смены времени',
  slideleft: 'Смена места или точки зрения',
  zoomin: 'Драматичный, для важных моментов',
  cut: 'Резкий, для быстрых сцен',
  fadeblack: 'Пауза между частями, «прошло время»',
  fadewhite: 'Вспышка: воспоминание, удар, сюрприз',
  dissolve: 'Зернистое растворение, мечтательно',
  hblur: 'Мягкое размытие, переход мысли',
  slideright: 'Возврат назад, «до этого»',
  slideup: 'Подъём: рост, следующий уровень',
  slidedown: 'Спуск, переход к деталям',
  smoothleft: 'Динамичный сдвиг с размытием движения',
  wipeleft: 'Чёткая смена темы',
  wiperight: 'Чёткая смена темы в обратную сторону',
  circleopen: 'Раскрытие из центра, акцент на герое',
  circleclose: 'Закрытие в точку, финал блока',
  pixelize: 'Цифровой, игровой, технологичный',
  radial: 'По кругу, как стрелка часов: отсчёт времени'
}

export const secondsLabel = (s: number): string => `${s.toFixed(1).replace('.', ',')} с`

/** The joint between a clip and the next one on the timeline; it opens the Transisi panel for that joint. */
export function TransitionButton({ clip, next, x, selected, onPick }: { clip: Clip; next: Clip; x: number; selected: boolean; onPick: () => void }) {
  const current = TRANSITIONS.find((t) => t.id === clip.transition) ?? TRANSITIONS[0]
  const Icon = TRANSITION_ICONS[current.id]
  const seconds = transitionSecOf(clip)
  return (
    <button
      type="button"
      onPointerDown={(e: PointerEvent) => e.stopPropagation()}
      onClick={onPick}
      aria-label={`Переход от «${clip.title}» к «${next.title}»: ${current.label}`}
      aria-pressed={selected}
      title={`Переход: ${current.label}${seconds ? ` · ${secondsLabel(seconds)}` : ''}`}
      className={cx(
        // Small and on top, so the clip edges above and below it can still be dragged.
        'absolute top-1/2 z-[5] flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink shadow-[0_1px_0_rgba(0,0,0,0.25)] transition-colors',
        current.id === 'cut' ? 'bg-surface text-ink-2 hover:bg-sun-soft' : 'bg-sun text-ink hover:bg-sun-soft',
        selected && 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
      )}
      style={{ left: x }}
    >
      <Icon className="size-3" strokeWidth={2.4} />
    </button>
  )
}
