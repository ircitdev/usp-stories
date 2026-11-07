import { useEffect, useState } from 'react'
import { Film, Globe, Loader2, Music, Trash2, Upload, Wand2 } from 'lucide-react'
import type { FolderView } from '@shared/api'
import type { BasePrompt, FolderTrack } from '@shared/types'
import { EditableName } from '../components/EditableName'
import { Button, cx, inputCls } from '../components/ui'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'

const EMPTY: BasePrompt = { brief: '', visual: '', music: '' }

/** Edited locally and saved when the field loses focus. */
function Area({ label, hint, value, rows, onSave }: { label: string; hint: string; value: string; rows: number; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <textarea
        rows={rows}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
        className={cx(inputCls, 'h-auto resize-y py-2.5 text-[13px] leading-relaxed')}
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  )
}

/**
 * «Базовый промпт» of a folder: the common style of its videos — brief for the script, look for pictures and video,
 * music direction. Made from the brand's site or a sample video, then edited by hand.
 */
export function BasePromptTab({ name, f, onChange }: { name: string; f: FolderView; onChange: (f: FolderView) => void }) {
  const { toast } = useApp()
  const [url, setUrl] = useState(f.basePrompt?.source && /^https?:/.test(f.basePrompt.source) ? f.basePrompt.source : '')
  const [busy, setBusy] = useState<'url' | 'video' | null>(null)
  const bp = { ...EMPTY, ...(f.basePrompt ?? {}) }
  const save = async (patch: Partial<BasePrompt>): Promise<void> => onChange(await window.api.folders.set(name, { basePrompt: { ...bp, ...patch } }))
  const filled = !!(bp.brief.trim() || bp.visual.trim() || bp.music.trim())
  const fromUrl = async (): Promise<void> => {
    if (!url.trim()) return
    setBusy('url')
    try {
      onChange(await window.api.folders.basePromptFromUrl(name, url))
      toast('success', 'Базовый промпт составлен по сайту — проверьте и поправьте, если нужно')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }
  const fromVideo = async (): Promise<void> => {
    setBusy('video')
    try {
      const got = await window.api.folders.basePromptFromVideo(name)
      if (got) {
        onChange(got)
        toast('success', 'Базовый промпт составлен по видео — проверьте и поправьте, если нужно')
      }
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-ink-2">
        Общий стиль всех видео «{name}»: о чём проект и каким тоном говорить, как выглядят кадры, какая звучит музыка. Используется в каждом видео папки, где включено
        «Применить базовый промпт», — при написании сценария, раскадровке, создании кадров, видео во Flow и музыки.
      </p>
      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-3">
        <span className="text-sm font-semibold">{filled ? 'Составить заново' : 'Составить автоматически'}</span>
        <div className="flex items-center gap-2">
          <input
            className={cx(inputCls, 'flex-1')}
            placeholder="Адрес сайта, например telemore.ru"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void fromUrl()}
            spellCheck={false}
          />
          <Button icon={<Globe className="size-4" />} loading={busy === 'url'} disabled={!!busy || !url.trim()} onClick={() => void fromUrl()}>
            По сайту
          </Button>
          <Button icon={<Film className="size-4" />} loading={busy === 'video'} disabled={!!busy} onClick={() => void fromVideo()}>
            По видео…
          </Button>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
          {busy === 'url'
            ? 'Читаем сайт и пишем промпт… до минуты'
            : busy === 'video'
              ? 'Смотрим кадры и слушаем речь локальной моделью… 1–3 минуты'
              : 'Сайт читает автор сценария из настроек; видео разбирает локальная модель (Ollama) — кадры и речь не уходят в интернет.'}
        </span>
        {bp.source && <span className="text-xs text-muted">Сейчас составлен по: {bp.source}</span>}
      </div>
      <Area
        label="О проекте, аудитория и тон — для сценария"
        hint="По-русски. Что за проект, для кого видео, как говорить, какие факты можно упоминать и чего избегать."
        rows={6}
        value={bp.brief}
        onSave={(v) => void save({ brief: v })}
      />
      <Area
        label="Как выглядят видео — для кадров и видео"
        hint="По-английски: так его лучше понимают модели картинок и видео. Места, люди, цвета, свет, камера. Без брендов и надписей."
        rows={4}
        value={bp.visual}
        onSave={(v) => void save({ visual: v })}
      />
      <Area label="Музыка" hint="По-английски: жанр, настроение, темп, инструменты." rows={2} value={bp.music} onSave={(v) => void save({ music: v })} />
    </div>
  )
}

const dur = (ms: number | null): string => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}` : '')

/** «Музыка» of a folder: its own tracks and every track uploaded or generated in its videos. */
export function FolderMusicTab({ name }: { name: string }) {
  const { toast } = useApp()
  const [tracks, setTracks] = useState<FolderTrack[] | null>(null)
  useEffect(() => {
    void window.api.folders.tracks(name).then(setTracks)
  }, [name])
  const reload = async (): Promise<void> => setTracks(await window.api.folders.tracks(name))
  const rename = async (t: FolderTrack, v: string): Promise<void> => {
    if (t.from === 'folder') await window.api.folders.renameFile(name, t.id, v)
    else await window.api.assets.rename(t.id, v)
    await reload()
  }
  const remove = async (t: FolderTrack): Promise<void> => {
    await window.api.folders.removeFile(name, t.id)
    await reload()
  }
  const add = async (): Promise<void> => {
    try {
      setTracks(await window.api.folders.addMusic(name))
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  if (!tracks) return null
  const own = tracks.filter((t) => t.from === 'folder')
  const fromVideos = tracks.filter((t) => t.from === 'project')
  const row = (t: FolderTrack) => (
    <div key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
      <Music className="size-4 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col text-[13px]">
        <EditableName value={t.name} onSave={(v) => void rename(t, v)} className="font-medium" />
        <span className="truncate text-xs text-muted">
          {[t.from === 'folder' ? 'Загружен в папку' : `Видео «${t.projectTitle}»`, t.provider, dur(t.durationMs)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <audio src={t.url} controls preload="none" className="h-8 w-[260px] shrink-0" />
      {t.from === 'folder' && (
        <button type="button" aria-label="Удалить трек" onClick={() => void remove(t)} className="text-muted hover:text-bad-ink">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-ink-2">
        Все треки проекта: загруженные в папку и созданные или выбранные в её видео. Треки папки появляются в каждом видео на вкладке «Музыка» — в новых сразу, в уже
        созданных после «Применить к видео в папке».
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Треки папки ({own.length})</span>
        {own.map(row)}
        <Button size="sm" icon={<Upload className="size-4" />} onClick={() => void add()} className="self-start">
          Загрузить треки
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Из видео папки ({fromVideos.length})</span>
        {fromVideos.length ? fromVideos.map(row) : <span className="text-[13px] text-muted">В видео папки пока нет музыки.</span>}
      </div>
    </div>
  )
}
