import type { CSSProperties } from 'react'
import type { TransitionId } from '@shared/types'

/**
 * How the outgoing clip (prev, drawn on top) and the incoming clip (cur) look at transition progress k
 * (0 to 1). Matches the FFmpeg xfade transitions of the export closely enough to judge them in the preview.
 */
export function transitionStyles(transition: TransitionId, k: number): { prev: CSSProperties; cur: CSSProperties } {
  const half = (x: number): number => Math.min(1, Math.max(0, x))
  switch (transition) {
    case 'slideleft':
      return { prev: { transform: `translateX(${-k * 100}%)` }, cur: { transform: `translateX(${(1 - k) * 100}%)` } }
    case 'slideright':
      return { prev: { transform: `translateX(${k * 100}%)` }, cur: { transform: `translateX(${-(1 - k) * 100}%)` } }
    case 'slideup':
      return { prev: { transform: `translateY(${-k * 100}%)` }, cur: { transform: `translateY(${(1 - k) * 100}%)` } }
    case 'slidedown':
      return { prev: { transform: `translateY(${k * 100}%)` }, cur: { transform: `translateY(${-(1 - k) * 100}%)` } }
    case 'smoothleft':
      return {
        prev: { transform: `translateX(${-k * 100}%)`, filter: `blur(${Math.sin(k * Math.PI) * 6}px)` },
        cur: { transform: `translateX(${(1 - k) * 100}%)`, filter: `blur(${Math.sin(k * Math.PI) * 6}px)` }
      }
    case 'zoomin':
      return { prev: { transform: `scale(${1 + k * 0.6})`, opacity: 1 - k }, cur: {} }
    case 'fadeblack':
      return { prev: { opacity: half(1 - 2 * k) }, cur: { opacity: half(2 * k - 1) } }
    case 'fadewhite':
      return {
        prev: { opacity: k < 0.5 ? 1 : 0, filter: `brightness(${1 + 8 * half(2 * k)})` },
        cur: { filter: `brightness(${1 + 8 * half(2 - 2 * k)})` }
      }
    case 'hblur':
      return { prev: { opacity: 1 - k, filter: `blur(${k * 14}px)` }, cur: { filter: `blur(${(1 - k) * 14}px)` } }
    case 'pixelize':
      return { prev: { opacity: k < 0.5 ? 1 : 0, filter: `blur(${half(2 * k) * 10}px) contrast(1.4)` }, cur: { filter: `blur(${half(2 - 2 * k) * 10}px) contrast(1.4)` } }
    case 'wipeleft':
      return { prev: { clipPath: `inset(0 ${k * 100}% 0 0)` }, cur: {} }
    case 'wiperight':
      return { prev: { clipPath: `inset(0 0 0 ${k * 100}%)` }, cur: {} }
    case 'circleopen': {
      const r = k * 75
      const mask = `radial-gradient(circle at 50% 50%, transparent ${r}%, #000 ${r + 0.5}%)`
      return { prev: { WebkitMaskImage: mask, maskImage: mask }, cur: {} }
    }
    case 'circleclose':
      return { prev: { clipPath: `circle(${(1 - k) * 75}% at 50% 50%)` }, cur: {} }
    case 'radial': {
      const mask = `conic-gradient(from 0deg, transparent ${k * 360}deg, #000 ${k * 360}deg)`
      return { prev: { WebkitMaskImage: mask, maskImage: mask }, cur: {} }
    }
    default:
      // fade, dissolve
      return { prev: { opacity: 1 - k }, cur: {} }
  }
}
