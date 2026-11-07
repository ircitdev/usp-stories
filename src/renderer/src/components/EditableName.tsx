import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { cx } from './ui'

/** A name that becomes a text field on click (or on the pencil); Enter or leaving the field saves, Esc cancels. */
export function EditableName({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = (): void => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== value) onSave(v)
    else setDraft(value)
  }
  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cx('w-full min-w-0 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-[13px] font-medium outline-none', className)}
        aria-label="Новое название"
      />
    )
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      title="Переименовать"
      className={cx('group/name flex min-w-0 items-center gap-1 text-left', className)}
    >
      <span className="truncate">{value}</span>
      <Pencil className="size-3 shrink-0 text-muted opacity-0 group-hover/name:opacity-100" />
    </button>
  )
}
