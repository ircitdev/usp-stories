import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Info } from 'lucide-react'
import { useApp } from '../store/app'

/**
 * An ⓘ next to a field label: a click opens a short tip and, when given, a ready prompt for a neural network
 * (ChatGPT, Gemini, Flow…) with a copy button, so the field can be filled by hand elsewhere too.
 */
export function InfoTip({ title, children, prompt, promptLabel }: { title: string; children: ReactNode; prompt?: string; promptLabel?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLSpanElement>(null)
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const { toast } = useApp()
  useEffect(() => {
    if (!open) return
    const close = (e: globalThis.MouseEvent): void => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !pop.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  // Inside a <label>: clicks here must not focus the field.
  const stop = (e: MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }
  return (
    <span ref={ref} className="relative inline-flex" onClick={stop}>
      <button
        type="button"
        aria-label={`Подсказка: ${title}`}
        aria-expanded={open}
        onClick={() => {
          // Fixed on the screen, inside its edges: dialogs scroll and clip, the tip must not.
          const r = ref.current!.getBoundingClientRect()
          const width = Math.min(380, window.innerWidth - 24)
          const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
          const below = r.bottom + 6
          setAt({ left, top: below + 320 > window.innerHeight ? Math.max(12, r.top - 326) : below })
          setOpen(!open)
        }}
        className="flex size-[18px] items-center justify-center rounded-full text-muted hover:text-accent"
      >
        <Info className="size-[15px]" />
      </button>
      {open &&
        createPortal(
        <span
          ref={pop}
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ left: at.left, top: at.top, maxWidth: 'calc(100vw - 24px)' }}
          className="fixed z-[100] flex w-[380px] cursor-auto flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 text-left text-[13px] font-normal leading-relaxed text-ink-2 shadow-ink-lg"
        >
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span>{children}</span>
          {prompt && (
            <>
              <span className="text-xs font-semibold text-ink">{promptLabel ?? 'Промпт для нейросети'}</span>
              <span className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-lg bg-paper px-2.5 py-2 font-mono text-[12px] text-ink select-text">{prompt}</span>
              <button
                type="button"
                onClick={() => {
                  void window.api.app.copyText(prompt)
                  toast('success', 'Промпт скопирован')
                }}
                className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-accent-dark hover:underline"
              >
                <Copy className="size-3.5" /> Скопировать промпт
              </button>
            </>
          )}
        </span>,
          document.body
        )}
    </span>
  )
}

/** A field label with an ⓘ tip after it. */
export function TipLabel({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {children}
    </span>
  )
}
