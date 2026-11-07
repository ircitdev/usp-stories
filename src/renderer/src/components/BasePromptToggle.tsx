import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { BasePrompt } from '@shared/types'
import { useProject } from '../store/project'
import { cx } from './ui'

/**
 * «Применить базовый промпт»: whether this video follows its folder's common style (Проект › Базовый промпт).
 * Shown only for a video in a folder; on by default. The prompt itself can be looked at without leaving the video.
 */
export function BasePromptToggle({ className }: { className?: string }) {
  const { project, updateEditor } = useProject()
  const [info, setInfo] = useState<{ folder: string; basePrompt: BasePrompt | null } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (project) void window.api.projects.basePrompt(project.id).then(setInfo)
  }, [project?.id])
  if (!project || !info?.folder) return null
  const bp = info.basePrompt
  const on = project.editor.useBasePrompt !== false
  return (
    <div className={cx('flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2.5', className)}>
      <div className="flex items-center gap-2.5">
        <label className={cx('flex flex-1 items-center gap-2.5 text-sm', bp ? 'cursor-pointer' : 'text-muted')}>
          <input type="checkbox" checked={on && !!bp} disabled={!bp} onChange={(e) => updateEditor({ useBasePrompt: e.target.checked })} className="size-4 accent-accent" />
          <span>
            <span className="font-semibold">Применить базовый промпт</span> проекта «{info.folder}»
          </span>
        </label>
        {bp ? (
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
            {open ? 'Скрыть' : 'Посмотреть'}
            <ChevronDown className={cx('size-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          <span className="text-xs text-muted">не задан — «Настройки проекта» на главном экране</span>
        )}
      </div>
      {open && bp && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-2 text-[12px] leading-relaxed text-ink-2">
          {bp.brief && <p className="whitespace-pre-line">{bp.brief}</p>}
          {bp.visual && (
            <p>
              <span className="font-semibold text-ink">Кадры: </span>
              {bp.visual}
            </p>
          )}
          {bp.music && (
            <p>
              <span className="font-semibold text-ink">Музыка: </span>
              {bp.music}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
