import { useEffect, useState } from 'react'
import { Check, Film, ImagePlus, Trash2, Upload } from 'lucide-react'
import type { FolderView } from '@shared/api'
import type { AppSettings, LibraryCharacter } from '@shared/types'
import { CaptionSettings, type CaptionLook } from '../components/CaptionSettings'
import { EditableName } from '../components/EditableName'
import { UsageView } from '../components/UsageView'
import { BasePromptTab, FolderMusicTab } from './FolderBaseAndMusic'
import { Button, Modal, Segmented, cx } from '../components/ui'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'

type Tab = 'characters' | 'base' | 'captions' | 'music' | 'media' | 'inserts' | 'usage'
const TABS: { id: Tab; label: string }[] = [
  { id: 'characters', label: 'Персонажи' },
  { id: 'base', label: 'Базовый промпт' },
  { id: 'captions', label: 'Субтитры' },
  { id: 'music', label: 'Музыка' },
  { id: 'media', label: 'Логотипы' },
  { id: 'inserts', label: 'Заставки' },
  { id: 'usage', label: 'Расходы' }
]
const BASE_LOOK: CaptionLook = { captionStyle: 'karaoke', captionPosition: 'bawah', captionSize: 'sedang' }

/**
 * Settings of a folder as a project (e.g. «Телеморе»): what every video in it gets — characters, caption look,
 * logos for overlays, opening and closing videos. New videos in the folder take them at once; existing ones on request.
 */
export function FolderSettingsModal({ name, projectIds, onClose }: { name: string; projectIds: string[]; onClose: () => void }) {
  const { toast } = useApp()
  const [tab, setTab] = useState<Tab>('characters')
  const [f, setF] = useState<FolderView | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [library, setLibrary] = useState<LibraryCharacter[]>([])
  const [applying, setApplying] = useState(false)
  useEffect(() => {
    void window.api.folders.get(name).then(setF)
    void window.api.settings.get().then(setSettings)
    void window.api.library.list().then(setLibrary)
  }, [name])
  if (!f || !settings) return null
  const save = async (patch: Partial<FolderView>): Promise<void> => setF(await window.api.folders.set(name, patch as never))

  const applyAll = async (): Promise<void> => {
    setApplying(true)
    try {
      for (const id of projectIds) await window.api.folders.apply(name, id)
      toast('success', `Настройки применены к видео в «${name}»: ${projectIds.length}`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Проект «${name}»`}
      subtitle="Что получает каждое видео этой папки. Новые видео — сразу при создании, уже созданные — кнопкой внизу."
      width={760}
    >
      <Segmented value={tab} onChange={setTab} options={TABS} className="self-start" />

      {tab === 'characters' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-2">Отмеченные персонажи из библиотеки добавятся в каждое видео — с листом персонажа, манерой и связью с Google Flow.</span>
          <div className="grid grid-cols-2 gap-2">
            {library.map((c) => {
              const on = f.characters.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void save({ characters: on ? f.characters.filter((x) => x !== c.id) : [...f.characters, c.id] })}
                  className={cx('flex items-center gap-3 rounded-xl border px-3 py-2 text-left', on ? 'border-accent bg-accent-soft' : 'border-line hover:border-ink-2')}
                >
                  {c.thumb ? <img src={c.thumb} alt="" className="size-11 rounded-lg object-cover" /> : <span className="size-11 rounded-lg bg-sand" />}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                    <span className="truncate text-xs text-muted">{c.role ?? (c.voiceName ? `Голос: ${c.voiceName}` : '')}</span>
                  </span>
                  {on && <Check className="size-4 text-accent" />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'base' && <BasePromptTab name={name} f={f} onChange={setF} />}

      {tab === 'music' && <FolderMusicTab name={name} />}

      {tab === 'usage' && <UsageView folder={name} />}

      {tab === 'captions' && (
        <div className="-mx-7 border-t border-line">
          <CaptionSettings
            look={{ ...BASE_LOOK, ...settings.captionDefaults, ...f.captions } as CaptionLook}
            onChange={(patch) => void save({ captions: { ...f.captions, ...patch } })}
            aspect="9:16"
            previewWidth={200}
          />
        </div>
      )}

      {tab === 'media' && (
        <div className="flex flex-col gap-3">
          <span className="text-[13px] text-ink-2">Логотипы и водяные знаки появятся в каждом видео на вкладке «Наложения» — добавляются одним кликом.</span>
          <div className="grid grid-cols-4 gap-2.5">
            {f.logos.map((l) => (
              <div key={l.id} className="group relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                <img src={l.url} alt="" className="max-h-full max-w-full object-contain p-2" />
                <span className="absolute inset-x-0 bottom-0 bg-surface/95 px-2 py-0.5 text-[11px]">
                  <EditableName value={l.name} onSave={async (v) => setF(await window.api.folders.renameFile(name, l.id, v))} className="text-[11px]" />
                </span>
                <button
                  type="button"
                  aria-label="Удалить картинку"
                  onClick={async () => setF(await window.api.folders.removeFile(name, l.id))}
                  className="absolute right-1 top-1 hidden rounded-md bg-surface p-1 text-muted hover:text-bad-ink group-hover:block"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={async () => setF(await window.api.folders.addLogos(name))}
              className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-line-3 text-[13px] text-ink-2 hover:border-ink"
            >
              <ImagePlus className="size-5" /> Загрузить
            </button>
          </div>
        </div>
      )}

      {tab === 'inserts' && (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-[13px] text-ink-2">
            <Film className="mt-0.5 size-4 shrink-0" />
            Загрузите варианты в 9:16 и 16:9. Отмеченный вариант своего формата встаёт в каждое видео папки; в самом видео его можно сменить.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {(['intro', 'outro'] as const).map((kind) => (
              <div key={kind} className="flex flex-col gap-2">
                <span className="text-sm font-semibold">{kind === 'intro' ? 'В начало (preroll)' : 'В конец (outro)'}</span>
                {f.inserts
                  .filter((x) => x.kind === kind)
                  .map((x) => {
                    const vertical = (x.height ?? 0) > (x.width ?? 0)
                    const key = `${kind}${vertical ? '916' : '169'}` as keyof FolderView['defaults']
                    const on = f.defaults[key] === x.id
                    return (
                      <div key={x.id} className={cx('flex items-center gap-2.5 rounded-lg border px-3 py-2', on ? 'border-accent bg-accent-soft' : 'border-line')}>
                        <input type="radio" checked={on} onChange={() => void save({ defaults: { ...f.defaults, [key]: x.id } })} aria-label={`По умолчанию: ${x.name}`} />
                        <video src={x.url} muted className="h-14 w-auto rounded-md bg-ink" />
                        <div className="flex min-w-0 flex-1 flex-col text-[13px]">
                          <EditableName value={x.name} onSave={async (v) => setF(await window.api.folders.renameFile(name, x.id, v))} className="font-medium" />
                          <span className="text-xs text-muted">
                            {vertical ? '9:16' : '16:9'} · {((x.durationMs ?? 0) / 1000).toFixed(1)} с{on ? ` · для всех ${vertical ? 'вертикальных' : 'горизонтальных'}` : ''}
                          </span>
                        </div>
                        <button type="button" aria-label="Удалить вариант" onClick={async () => setF(await window.api.folders.removeFile(name, x.id))} className="text-muted hover:text-bad-ink">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    )
                  })}
                <Button size="sm" icon={<Upload className="size-4" />} onClick={async () => setF(await window.api.folders.addInserts(name, kind))} className="self-start">
                  Загрузить варианты
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <span className="flex-1 text-[13px] text-muted">Изменения сохраняются сразу. Новые видео в «{name}» получат их автоматически.</span>
        <Button disabled={!projectIds.length} loading={applying} onClick={() => void applyAll()}>
          Применить к видео в папке ({projectIds.length})
        </Button>
        <Button variant="ink" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Modal>
  )
}
