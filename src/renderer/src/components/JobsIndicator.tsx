import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, Clock, Loader2, X } from 'lucide-react'
import type { Job } from '@shared/types'
import { useApp } from '../store/app'
import { useProject } from '../store/project'
import { Progress, cx } from './ui'

const KIND: Record<Job['kind'], string> = {
  story: 'Сценарий',
  image: 'Кадр',
  sheet: 'Лист персонажа',
  video: 'Видео',
  tts: 'Озвучка',
  narration: 'Озвучка',
  align: 'Субтитры по голосу',
  export: 'Экспорт',
  music: 'Музыка'
}

const active = (j: Job): boolean => j.status === 'queued' || j.status === 'running'

/**
 * The project's tasks in the header: «2/4 · 92% Создаём видео» while something runs. A click opens the list of the
 * current batch (every task since the oldest one still running) with progress, errors and a cancel button each.
 */
export function JobsIndicator() {
  const { jobs, clips, characters } = useProject()
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // A finished export says so, with a way to the file: the export dialog is closed by then.
  const seen = useRef<Record<string, Job['status']>>({})
  useEffect(() => {
    for (const j of Object.values(jobs)) {
      const before = seen.current[j.id]
      seen.current[j.id] = j.status
      if (j.kind !== 'export' || !before || before === j.status || !active({ ...j, status: before })) continue
      if (j.status === 'done' && j.message) {
        const file = j.message
        toast('success', `Видео готово: ${file.split(/[\\/]/).pop()}`, { label: 'Показать файл', run: () => void window.api.exporter.reveal(file) })
      } else if (j.status === 'failed') toast('error', `Экспорт не удался: ${j.error ?? 'ошибка'}`)
    }
  }, [jobs, toast])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const all = Object.values(jobs)
  const running = all.filter(active)
  if (!running.length) return null
  const since = Math.min(...running.map((j) => j.createdAt)) - 1000
  const batch = all.filter((j) => j.createdAt >= since || active(j)).sort((a, b) => a.createdAt - b.createdAt)
  const finished = batch.filter((j) => !active(j)).length
  const current = running.filter((j) => j.status === 'running').sort((a, b) => b.progress - a.progress)[0] ?? running[0]

  const title = (j: Job): string => {
    if (j.clipId) {
      const i = clips.findIndex((c) => c.id === j.clipId)
      if (i >= 0) return `${KIND[j.kind]} · клип ${String(i + 1).padStart(2, '0')}${clips[i].title ? ` «${clips[i].title}»` : ''}`
    }
    if (j.characterId) {
      const c = characters.find((x) => x.id === j.characterId)
      if (c) return `${KIND[j.kind]} · ${c.name}`
    }
    return KIND[j.kind]
  }
  const pct = (j: Job): string => `${Math.round(j.progress * 100)}%`
  const cancel = (j: Job): void => void window.api.generate.cancel(j.id)

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Задачи проекта"
        className="flex h-10 max-w-[300px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] hover:border-ink-2"
      >
        <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
        <span className="shrink-0 font-mono font-semibold">
          {Math.min(finished + 1, batch.length)}/{batch.length}
        </span>
        <span className="shrink-0 font-mono text-ink-2">{current.status === 'running' ? pct(current) : 'в очереди'}</span>
        <span className="min-w-0 truncate text-ink-2">{current.message || title(current)}</span>
        <ChevronDown className={cx('size-3.5 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 flex w-[420px] flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-ink-md">
          <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
            <span className="text-sm font-semibold">
              Задачи: готово {finished} из {batch.length}
            </span>
            {running.length > 1 && (
              <button type="button" onClick={() => running.forEach(cancel)} className="text-xs text-muted hover:text-bad-ink">
                Отменить все
              </button>
            )}
          </div>
          <div className="scroll-thin flex max-h-[420px] flex-col gap-1 overflow-y-auto">
            {batch.map((j) => (
              <div key={j.id} className={cx('flex flex-col gap-1.5 rounded-xl px-2.5 py-2', active(j) ? 'bg-paper' : '')}>
                <div className="flex items-center gap-2 text-[13px]">
                  {j.status === 'running' ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
                  ) : j.status === 'queued' ? (
                    <Clock className="size-4 shrink-0 text-muted" />
                  ) : j.status === 'done' ? (
                    <Check className="size-4 shrink-0 text-ok-ink" />
                  ) : j.status === 'failed' ? (
                    <AlertCircle className="size-4 shrink-0 text-bad-ink" />
                  ) : (
                    <X className="size-4 shrink-0 text-muted" />
                  )}
                  <span className={cx('min-w-0 flex-1 truncate', !active(j) && 'text-ink-2')}>{title(j)}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {j.status === 'running' ? pct(j) : j.status === 'queued' ? 'в очереди' : j.status === 'done' ? 'готово' : j.status === 'failed' ? 'ошибка' : 'отменено'}
                  </span>
                  {j.kind === 'export' && j.status === 'done' && j.message && (
                    <button type="button" onClick={() => void window.api.exporter.reveal(j.message!)} className="text-xs font-semibold text-accent-dark hover:underline">
                      Показать файл
                    </button>
                  )}
                  {active(j) && (
                    <button type="button" aria-label={`Отменить: ${title(j)}`} title="Отменить задачу" onClick={() => cancel(j)} className="rounded-md p-0.5 text-muted hover:bg-bad-soft hover:text-bad-ink">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {j.status === 'running' && <Progress value={j.progress} />}
                {active(j) && j.message && <span className="pl-6 text-xs text-ink-2">{j.message}</span>}
                {j.status === 'failed' && j.error && <span className="line-clamp-3 pl-6 text-xs text-bad-ink">{j.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
