import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Captions, Check, CheckCircle2, Loader2, Pencil, Redo2, Save, Settings2, SlidersHorizontal, Undo2 } from 'lucide-react'
import { ProjectSettingsModal, type ProjectTab } from './ProjectSettingsModal'
import type { Step } from '@shared/types'
import { Button, IconButton, Kbd, cx } from '../../components/ui'
import { relativeTime } from '../../lib/format'
import { useApp } from '../../store/app'
import { JobsIndicator } from '../../components/JobsIndicator'
import { useProject } from '../../store/project'

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Идея' },
  { n: 2, label: 'Сценарий' },
  { n: 3, label: 'Раскадровка' },
  { n: 4, label: 'Монтаж' }
]

function SaveStatus() {
  const { saveState, saveError, savedAt, save } = useProject()
  if (saveState === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-sun-ink">
        <Loader2 className="size-3.5 animate-[spin_0.8s_linear_infinite]" />
        Сохраняем…
      </span>
    )
  if (saveState === 'dirty')
    return (
      <span className="flex items-center gap-1.5 text-xs text-accent-dark">
        <span className="size-[7px] rounded-full bg-accent" />
        Есть несохранённые изменения
      </span>
    )
  if (saveState === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs text-bad-ink" title={saveError ?? ''}>
        <AlertCircle className="size-3.5" />
        Не удалось сохранить ·
        <button type="button" className="font-semibold underline" onClick={() => void save()}>
          Повторить
        </button>
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-xs text-ok-ink">
      <CheckCircle2 className="size-3.5" />
      Сохранено · {savedAt ? relativeTime(savedAt) : 'только что'}
    </span>
  )
}

export function ProjectHeader({ doneSteps, right }: { doneSteps: Step[]; right?: ReactNode }) {
  const { project, updateProject, save, flush, undo, redo, undoCount, redoCount } = useProject()
  // Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo the project's edits; inside a text field they stay the field's own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if ((k === 'z' || k === 'я') && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || k === 'н' || ((k === 'z' || k === 'я') && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])
  const { go } = useApp()
  const [settingsTab, setSettingsTab] = useState<ProjectTab | null>(null)
  // Other parts of the editor (the timeline's intro/outro) open a tab of the project settings.
  useEffect(() => {
    const open = (e: Event): void => setSettingsTab(((e as CustomEvent).detail as ProjectTab) || 'cover')
    window.addEventListener('usp:project-settings', open)
    return () => window.removeEventListener('usp:project-settings', open)
  }, [])
  const [editing, setEditing] = useState(false)
  if (!project) return null

  const setStep = (n: Step): void => {
    const s = project.status
    const status =
      n === 4 && s !== 'exported' ? 'editing' : n === 3 && (s === 'draft' || s === 'script') ? 'storyboard' : n === 2 && s === 'draft' ? 'script' : s
    updateProject({ step: n, status })
  }

  return (
    <header className="grid h-[68px] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-4 border-b border-line bg-surface px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton
          label="На главную"
          onClick={async () => {
            await flush()
            go({ name: 'home' })
          }}
        >
          <ArrowLeft className="size-[18px]" />
        </IconButton>
        <div className="flex min-w-0 flex-col gap-px">
          <div className="flex min-w-0 items-center gap-1">
            {editing ? (
              <input
                autoFocus
                defaultValue={project.title}
                aria-label="Название проекта"
                onBlur={(e) => {
                  updateProject({ title: e.target.value.trim() || project.title })
                  setEditing(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="h-8 w-[320px] rounded-lg border border-ink bg-surface px-2 font-display text-lg font-bold outline-none"
              />
            ) : (
              <>
                <span className="truncate font-display text-lg font-bold">{project.title}</span>
                <button
                  type="button"
                  aria-label="Переименовать проект"
                  onClick={() => setEditing(true)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
                >
                  <Pencil className="size-[15px]" />
                </button>
              </>
            )}
          </div>
          <SaveStatus />
        </div>
      </div>

      <nav aria-label="Этапы работы" className="flex items-center gap-1 rounded-full border border-line bg-sand p-1">
        {STEPS.map((s) => {
          const active = project.step === s.n
          const done = doneSteps.includes(s.n) && !active
          return (
            <button
              key={s.n}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => setStep(s.n)}
              className={cx(
                'inline-flex h-9 items-center gap-2 rounded-full py-0 pl-1.5 pr-4 text-sm',
                active ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink-2 hover:text-ink'
              )}
            >
              <span
                className={cx(
                  'inline-flex size-6 items-center justify-center rounded-full text-xs',
                  active ? 'bg-accent text-white' : done ? 'bg-ok-soft text-ok-ink' : 'border border-line-2 bg-surface text-ink-2'
                )}
              >
                {done ? <Check className="size-[13px]" strokeWidth={3} /> : s.n}
              </span>
              {s.label}
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-end gap-2.5">
        <JobsIndicator />
        <IconButton label={`Отменить (Ctrl+Z)${undoCount ? '' : ' — нечего отменять'}`} onClick={undo} disabled={!undoCount}>
          <Undo2 className="size-[18px]" />
        </IconButton>
        <IconButton label={`Вернуть (Ctrl+Shift+Z)${redoCount ? '' : ' — нечего возвращать'}`} onClick={redo} disabled={!redoCount}>
          <Redo2 className="size-[18px]" />
        </IconButton>
        <IconButton label="Настройки проекта: обложка, персонажи, медиа, заставки" onClick={() => setSettingsTab('cover')}>
          <Settings2 className="size-[18px]" />
        </IconButton>
        <IconButton label="Субтитры проекта" onClick={() => setSettingsTab('captions')}>
          <Captions className="size-[18px]" />
        </IconButton>
        {settingsTab && <ProjectSettingsModal initial={settingsTab} onClose={() => setSettingsTab(null)} />}
        <Button icon={<Save className="size-[17px]" />} onClick={() => void save()}>
          Сохранить
          <span className="hidden 2xl:inline">
            <Kbd>Ctrl S</Kbd>
          </span>
        </Button>
        <IconButton
          label="Настройки"
          onClick={async () => {
            await flush()
            go({ name: 'settings', back: { name: 'project', id: project.id } })
          }}
        >
          <SlidersHorizontal className="size-[18px]" />
        </IconButton>
        {right}
      </div>
    </header>
  )
}
