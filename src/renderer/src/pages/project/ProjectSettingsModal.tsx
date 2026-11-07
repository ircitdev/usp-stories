import { useState } from 'react'
import { Film, ImagePlus, RefreshCw, Trash2, Upload, Wand2 } from 'lucide-react'
import type { Asset } from '@shared/types'
import { BasePromptToggle } from '../../components/BasePromptToggle'
import { CaptionSettings } from '../../components/CaptionSettings'
import { CharacterAvatar } from '../../components/CharacterAvatar'
import { EditableName } from '../../components/EditableName'
import { UsageView } from '../../components/UsageView'
import { Button, Modal, Segmented, cx } from '../../components/ui'
import { errorText } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { LibraryPicker } from './CharacterModal'
import { MusicTab } from './editor/Inspector'

export type ProjectTab = 'cover' | 'characters' | 'captions' | 'music' | 'media' | 'inserts' | 'usage'

const TABS: { id: ProjectTab; label: string }[] = [
  { id: 'cover', label: 'Обложка' },
  { id: 'characters', label: 'Персонажи' },
  { id: 'captions', label: 'Субтитры' },
  { id: 'music', label: 'Музыка' },
  { id: 'media', label: 'Медиа' },
  { id: 'inserts', label: 'Заставки' },
  { id: 'usage', label: 'Расходы' }
]

/** Everything about a project besides its clips: cover, characters, captions, pictures for overlays, intro/outro. */
export function ProjectSettingsModal({ onClose, initial = 'cover' }: { onClose: () => void; initial?: ProjectTab }) {
  const [tab, setTab] = useState<ProjectTab>(initial)
  const { project } = useProject()
  if (!project) return null
  return (
    <Modal open onClose={onClose} title="Настройки проекта" subtitle={project.title} width={720}>
      <BasePromptToggle />
      <Segmented value={tab} onChange={setTab} options={TABS} className="self-start" />
      {tab === 'cover' && <CoverTab />}
      {tab === 'characters' && <CharactersTab />}
      {tab === 'captions' && <CaptionsTab />}
      {tab === 'music' && (
        <div className="-mx-7 -mb-4 border-t border-line">
          <MusicTab />
        </div>
      )}
      {tab === 'media' && <MediaTab />}
      {tab === 'inserts' && <InsertsTab />}
      {tab === 'usage' && <UsageView projectId={project.id} />}
    </Modal>
  )
}

function CoverTab() {
  const { project, clips, assets, addAsset } = useProject()
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)
  const [coverId, setCoverId] = useState<string | null>(project?.coverAssetId ?? null)
  if (!project) return null
  const cover = coverId ? assets[coverId] : null
  const frames = clips.map((c) => (c.imageAssetId ? assets[c.imageAssetId] : null)).filter((a): a is Asset => !!a)
  const make = async (): Promise<void> => {
    setBusy(true)
    try {
      const a = await window.api.projects.makeCover(project.id)
      addAsset(a)
      setCoverId(a.id)
      toast('success', 'Обложка готова')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const choose = async (a: Asset): Promise<void> => {
    await window.api.projects.setCover(project.id, a.id)
    setCoverId(a.id)
  }
  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-paper">
        {cover ? (
          <img src={cover.url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-sm text-muted">Обложки ещё нет</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="accent" icon={cover ? <RefreshCw className="size-4" /> : <Wand2 className="size-4" />} loading={busy} onClick={() => void make()}>
          {cover ? 'Сгенерировать заново' : 'Сгенерировать обложку'}
        </Button>
        <span className="text-[13px] text-ink-2">
          {busy ? 'Qwen-Image рисует обложку по кадрам проекта… около минуты' : 'Рисуется на этом компьютере по главному персонажу, сценам и стилю проекта.'}
        </span>
      </div>
      {frames.length > 0 && (
        <>
          <span className="text-sm font-semibold">Или возьмите кадр из проекта</span>
          <div className="flex flex-wrap gap-2">
            {frames.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void choose(a)}
                className={cx('h-20 overflow-hidden rounded-lg border', a.id === coverId ? 'border-2 border-accent' : 'border-line hover:border-ink-2')}
              >
                <img src={a.url} alt="" className="h-full w-auto object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CharactersTab() {
  const { characters, assets, removeCharacter } = useProject()
  return (
    <div className="flex flex-col gap-3.5">
      <span className="text-sm font-semibold">В проекте</span>
      {characters.length ? (
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-line-2 py-1 pl-1 pr-2 text-sm">
              <CharacterAvatar name={c.name} sheetUrl={c.sheetAssetId ? assets[c.sheetAssetId]?.url : null} size={28} />
              {c.name}
              <button type="button" aria-label={`Убрать ${c.name} из проекта`} onClick={() => removeCharacter(c.id)} className="text-muted hover:text-bad-ink">
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[13px] text-muted">Пока никого. Добавьте из библиотеки ниже — внешность, лист персонажа и голос подставятся сами.</span>
      )}
      <LibraryPicker onAdded={() => undefined} />
    </div>
  )
}

function CaptionsTab() {
  const { project, clips, assets, selectedClipId, updateEditor } = useProject()
  if (!project) return null
  const clip = clips.find((c) => c.id === selectedClipId && c.imageAssetId) ?? clips.find((c) => c.imageAssetId) ?? null
  return (
    <div className="-mx-7 -mb-4 border-t border-line">
      <CaptionSettings
        look={project.editor}
        onChange={updateEditor}
        aspect={project.aspectRatio}
        image={clip?.imageAssetId ? (assets[clip.imageAssetId]?.url ?? null) : null}
        text={clip?.narration.replace(/<[^>]+>/g, ' ')}
        previewWidth={project.aspectRatio === '9:16' ? 200 : 420}
      />
    </div>
  )
}

function MediaTab() {
  const { project, assets, addAsset, load } = useProject()
  const { toast } = useApp()
  if (!project) return null
  const pics = Object.values(assets).filter((a) => a.kind === 'overlay')
  const add = async (): Promise<void> => {
    try {
      for (const a of await window.api.assets.pickImages(project.id)) addAsset(a)
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const rename = async (a: Asset, v: string): Promise<void> => {
    await window.api.assets.rename(a.id, v)
    addAsset({ ...a, prompt: v })
  }
  const remove = async (a: Asset): Promise<void> => {
    if ((project.editor.overlays ?? []).some((o) => o.kind === 'image' && o.assetId === a.id)) {
      toast('error', 'Эта картинка стоит в наложениях монтажа — сначала уберите её там.')
      return
    }
    await window.api.assets.remove(a.id)
    load(await window.api.projects.get(project.id))
  }
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[13px] text-ink-2">Логотипы, водяные знаки и другие картинки. При монтаже их выбирают на вкладке «Наложения» одним кликом.</p>
      <div className="grid grid-cols-4 gap-2.5">
        {pics.map((a) => (
          <div key={a.id} className="group relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            <img src={a.url} alt="" className="max-h-full max-w-full object-contain p-2" />
            <span className="absolute inset-x-0 bottom-0 bg-surface/95 px-2 py-0.5 text-[11px]">
              <EditableName value={a.prompt ?? ''} onSave={(v) => void rename(a, v)} className="text-[11px]" />
            </span>
            <button
              type="button"
              aria-label="Удалить картинку"
              onClick={() => void remove(a)}
              className="absolute right-1 top-1 hidden rounded-md bg-surface p-1 text-muted hover:text-bad-ink group-hover:block"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => void add()}
          className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-3 text-[13px] text-ink-2 hover:border-ink"
        >
          <ImagePlus className="size-5" /> Загрузить
        </button>
      </div>
    </div>
  )
}

function InsertsTab() {
  const { project, assets, addAsset, updateEditor, load } = useProject()
  const { toast } = useApp()
  if (!project) return null
  const wantVertical = project.aspectRatio === '9:16'
  const column = (kind: 'intro' | 'outro', title: string, field: 'introAssetId' | 'outroAssetId') => {
    const list = Object.values(assets).filter((a) => a.kind === kind)
    const chosen = project.editor[field] ?? null
    const add = async (): Promise<void> => {
      try {
        for (const a of await window.api.assets.pickInserts(project.id, kind)) addAsset(a)
      } catch (e) {
        toast('error', errorText(e))
      }
    }
    const rename = async (a: Asset, v: string): Promise<void> => {
      await window.api.assets.rename(a.id, v)
      addAsset({ ...a, prompt: v })
    }
    const remove = async (a: Asset): Promise<void> => {
      if (chosen === a.id) updateEditor({ [field]: null })
      await window.api.assets.remove(a.id)
      load(await window.api.projects.get(project.id))
    }
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
          <input type="radio" checked={!chosen} onChange={() => updateEditor({ [field]: null })} />
          Без заставки
        </label>
        {list.map((a) => {
          const vertical = (a.height ?? 0) > (a.width ?? 0)
          const fits = vertical === wantVertical
          return (
            <div key={a.id} className={cx('flex items-center gap-2.5 rounded-lg border px-3 py-2', chosen === a.id ? 'border-accent bg-accent-soft' : 'border-line')}>
              <input type="radio" checked={chosen === a.id} onChange={() => updateEditor({ [field]: a.id })} aria-label={`Использовать ${a.prompt}`} />
              <video src={a.url} muted className="h-14 w-auto rounded-md bg-ink" />
              <div className="flex min-w-0 flex-1 flex-col text-[13px]">
                <EditableName value={a.prompt ?? ''} onSave={(v) => void rename(a, v)} className="font-medium" />
                <span className={cx('text-xs', fits ? 'text-muted' : 'text-sun-ink')}>
                  {vertical ? '9:16' : '16:9'} · {((a.durationMs ?? 0) / 1000).toFixed(1)} с{fits ? '' : ' — другой формат, будут поля'}
                </span>
              </div>
              <button type="button" aria-label="Удалить вариант" onClick={() => void remove(a)} className="text-muted hover:text-bad-ink">
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
        <Button size="sm" icon={<Upload className="size-4" />} onClick={() => void add()} className="self-start">
          Загрузить варианты
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3.5">
      <p className="flex items-start gap-2 text-[13px] text-ink-2">
        <Film className="mt-0.5 size-4 shrink-0" />
        Можно загрузить несколько вариантов в 9:16 и 16:9 и выбрать нужный. Выбранная заставка встанет в начало или конец готового видео при экспорте;
        её звук подгоняется по громкости к ролику, субтитры сдвигаются.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {column('intro', 'В начало (preroll)', 'introAssetId')}
        {column('outro', 'В конец (outro)', 'outroAssetId')}
      </div>
    </div>
  )
}
