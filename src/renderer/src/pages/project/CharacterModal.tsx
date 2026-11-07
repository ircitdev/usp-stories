import { useEffect, useState } from 'react'
import type { LibraryCharacter } from '@shared/types'
import { BookUser, Mic, RefreshCw, Sparkles, Trash2, Upload, UserPlus } from 'lucide-react'
import { Button, Field, Modal, Progress, confirmDialog, cx, inputCls } from '../../components/ui'
import { AppearanceTip } from '../../components/CharacterTips'
import { TipLabel } from '../../components/InfoTip'
import { MannerFields } from '../../components/MannerFields'
import { VideoCharacterImport } from '../../components/VideoCharacterImport'
import { errorText, plural } from '../../lib/format'
import { useApp } from '../../store/app'
import { isRunning, jobFor, useProject } from '../../store/project'

/**
 * Edits a character, or with `characterId` "new" collects a new one that is only added once it is saved,
 * so a misclick on "Tambah pemeran" leaves nothing behind.
 */
export function CharacterModal({
  characterId,
  onClose,
  onCreated
}: {
  characterId: string | null
  onClose: () => void
  /** Called with the id of a newly saved character, e.g. to keep its modal open for the sheet. */
  onCreated?: (id: string) => void
}) {
  if (characterId === 'new') return <NewCharacter onClose={onClose} onCreated={onCreated} />
  return <EditCharacter characterId={characterId} onClose={onClose} />
}

const LOOK_HINT =
  'Сначала внешность, затем «Default outfit:» — одежда по умолчанию на листе персонажа. В отдельной сцене одежду можно сменить строкой Wardrobe в визуальном промпте. Лучше писать по-английски, например: human man, 40s, short black hair, warm brown skin. Default outfit: light-blue colony medical scrubs, stethoscope.'

/**
 * Our own recurring characters (registry C:\AI\video-kit\characters.json): one click adds the character with
 * their appearance and photo card as the sheet. A character of the same name already in the project (e.g. one the
 * storyboard invented from the synopsis) is updated instead of duplicated.
 */
export function LibraryPicker({ onAdded }: { onAdded: (id: string) => void }) {
  const { project, characters, addCharacter, updateCharacter, updateProject, flush } = useProject()
  const { toast } = useApp()
  const [items, setItems] = useState<LibraryCharacter[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [useVoice, setUseVoice] = useState(true)
  useEffect(() => {
    void window.api.settings
      .library()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])
  if (items === null || !items.length) return null

  const add = async (e: LibraryCharacter): Promise<void> => {
    setBusy(e.id)
    try {
      const same = characters.find((c) => c.name.trim().toLowerCase() === e.name.trim().toLowerCase())
      let id: string
      if (same) {
        id = same.id
        updateCharacter(id, {
          ...(e.description ? { description: e.description } : {}),
          ...(e.manner ? { manner: e.manner } : {}),
          ...(e.expression ? { expression: e.expression } : {}),
          ...(e.flowName ? { flowName: e.flowName } : {})
        })
      } else id = addCharacter({ name: e.name, description: e.description, manner: e.manner, expression: e.expression, flowName: e.flowName })
      if (useVoice && e.voiceId && project) updateProject({ ttsProvider: 'voicestudio', ttsVoice: e.voiceId })
      // The character must be saved before the main process can attach its sheet.
      await flush()
      if (e.sheetPath) await window.api.generate.sheetFromLibrary(id, e.id)
      toast('success', same ? `«${e.name}»: лист и внешность обновлены из библиотеки` : `«${e.name}» добавлен из библиотеки`)
      onAdded(id)
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <BookUser className="size-4 text-ink-2" />
        <span className="text-sm font-semibold">Из нашей библиотеки</span>
        <div className="flex-1" />
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
          <input type="checkbox" checked={useVoice} onChange={(ev) => setUseVoice(ev.target.checked)} />
          Голос персонажа — голос рассказчика
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {items.map((e) => (
          <button
            key={e.id}
            type="button"
            disabled={!!busy}
            onClick={() => void add(e)}
            className={cx(
              'flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left hover:border-ink',
              busy === e.id && 'opacity-60'
            )}
          >
            {e.thumb ? (
              <img src={e.thumb} alt="" className="size-14 shrink-0 rounded-lg object-cover object-top" />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-sand">
                <UserPlus className="size-5 text-muted" />
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{e.name}</span>
              {e.role && <span className="truncate text-[12px] text-ink-2">{e.role}</span>}
              {e.voiceName && (
                <span className="flex items-center gap-1 truncate text-[12px] text-ink-2">
                  <Mic className="size-3" /> {e.voiceName}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function NewCharacter({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { addCharacter, updateProject, flush } = useProject()
  const { toast } = useApp()
  /** What «Создать из видео» found besides the text fields: the card for the sheet and a cloned voice. */
  const [fromVideo, setFromVideo] = useState<{ sheet: string | null; voiceId: string | null; thumb: string | null } | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [acting, setActing] = useState({ manner: '', expression: '', flowName: '' })
  const typed = !!(name.trim() || description.trim() || acting.manner.trim() || acting.expression.trim())

  const save = async (): Promise<void> => {
    const id = addCharacter({ name, description, ...acting })
    if (fromVideo?.voiceId) updateProject({ ttsProvider: 'voicestudio', ttsVoice: fromVideo.voiceId })
    if (fromVideo?.sheet) {
      try {
        // The character must be saved before the main process can attach its sheet.
        await flush()
        await window.api.generate.sheetFromFile(id, fromVideo.sheet)
      } catch (e) {
        toast('error', errorText(e))
      }
    }
    if (onCreated) onCreated(id)
    else onClose()
  }

  // Closing an untouched form adds nothing; closing after typing asks instead of guessing.
  const close = async (): Promise<void> => {
    if (!typed) return onClose()
    const keep = await confirmDialog({
      title: 'Сохранить персонажа?',
      body: 'Вы уже заполнили данные нового персонажа. Сохранить или удалить?',
      confirm: 'Сохранить',
      cancel: 'Удалить'
    })
    if (keep) void save()
    else onClose()
  }

  return (
    <Modal open onClose={() => void close()} title="Новый персонаж" subtitle="Выберите персонажа из нашей библиотеки или опишите нового." width={760}>
      <LibraryPicker onAdded={(id) => (onCreated ? onCreated(id) : onClose())} />
      <VideoCharacterImport
        name={name}
        onResult={(r, o) => {
          if (r.description) setDescription(r.description)
          setActing((a) => ({ ...a, manner: r.manner || a.manner, expression: r.expression || a.expression }))
          setFromVideo({ sheet: o.card ? r.sheetPath : r.portraitPath, voiceId: r.voiceId, thumb: o.card ? (r.sheetThumb ?? null) : (r.portraitThumb ?? null) })
        }}
      />
      <div className="flex h-[150px] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-[1.5px] border-dashed border-line-3 bg-paper text-sm text-ink-2">
        {fromVideo?.thumb ? (
          <img src={fromVideo.thumb} alt="" className="size-full object-contain" />
        ) : (
          <>
            <UserPlus className="size-6 text-muted" />
            Лист персонажа создаётся после сохранения.
          </>
        )}
      </div>
      {fromVideo?.voiceId && <span className="text-[13px] text-ok-ink">Голос клонирован — после сохранения он станет голосом рассказчика проекта.</span>}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
        <Field label="Имя">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Пересвет" className={cx(inputCls, 'h-11')} />
        </Field>
        <Field
          label={
            <TipLabel text="Внешность">
              <AppearanceTip />
            </TipLabel>
          }
          hint={LOOK_HINT}
        >
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cx(inputCls, 'resize-none py-2.5 text-sm leading-relaxed')}
          />
        </Field>
      </div>
      <MannerFields manner={acting.manner} expression={acting.expression} flowName={acting.flowName} onChange={(p) => setActing({ ...acting, ...p })} />
      <div className="flex items-center justify-end gap-2.5">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
          Сохранить персонажа
        </Button>
      </div>
    </Modal>
  )
}

function EditCharacter({ characterId, onClose }: { characterId: string | null; onClose: () => void }) {
  const { characters, assets, jobs, updateCharacter, removeCharacter, flush, clips } = useProject()
  const { toast } = useApp()
  const c = characters.find((x) => x.id === characterId)
  if (!c) return null
  const sheet = c.sheetAssetId ? assets[c.sheetAssetId] : null
  const job = jobFor(jobs, 'sheet', { characterId: c.id })
  const running = isRunning(job)
  const usedIn = clips.filter((cl) => cl.characterIds.includes(c.id)).length

  const generate = async (): Promise<void> => {
    try {
      await flush()
      await window.api.generate.characterSheet(c.id)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  // A picture from disk becomes the sheet as is: a real person's photo card keeps their face in reference videos.
  const upload = async (): Promise<void> => {
    try {
      await flush()
      const a = await window.api.generate.pickCharacterSheet(c.id)
      if (a) toast('success', 'Лист персонажа загружен')
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Удалить персонажа ${c.name}?`,
      body: `Персонаж используется в ${usedIn} ${plural(usedIn, ['клипе', 'клипах', 'клипах'])}. Клипы останутся, у них просто пропадёт связь с персонажем.`,
      confirm: 'Удалить персонажа',
      danger: true
    })
    if (!ok) return
    removeCharacter(c.id)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Лист персонажа" subtitle={`Служит образцом в ${usedIn} ${plural(usedIn, ['клипе', 'клипах', 'клипах'])}, чтобы персонаж везде выглядел одинаково.`} width={760}>
      <div className="relative aspect-video overflow-hidden rounded-xl border-[1.5px] border-ink bg-paper">
        {sheet ? (
          <img src={sheet.url} alt={`Лист персонажа ${c.name}`} className="size-full object-contain" />
        ) : running ? null : (
          <div className="flex size-full flex-col items-center justify-center gap-3 text-ink-2">
            <span className="text-sm">Листа персонажа пока нет</span>
            <div className="flex gap-2">
              <Button variant="accent" icon={<Sparkles className="size-4" />} disabled={running} onClick={() => void generate()}>
                Создать лист персонажа
              </Button>
              <Button icon={<Upload className="size-4" />} disabled={running} onClick={() => void upload()}>
                Загрузить свой лист
              </Button>
            </div>
          </div>
        )}
        {running && (
          <div
            className={cx(
              'absolute inset-0 flex flex-col items-center justify-center gap-2',
              sheet ? 'bg-paper/80 backdrop-blur-[3px]' : 'bg-paper'
            )}
          >
            <span className="text-sm font-semibold text-sun-ink">
              {job!.message ?? 'Обработка'}… {Math.round(job!.progress * 100)}%
            </span>
            <Progress value={job!.progress} className="w-1/2" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4">
        <Field label="Имя">
          <input value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} className={cx(inputCls, 'h-11')} />
        </Field>
        <Field
          label={
            <TipLabel text="Внешность">
              <AppearanceTip />
            </TipLabel>
          }
          hint={LOOK_HINT}
        >
          <textarea
            rows={3}
            value={c.description}
            onChange={(e) => updateCharacter(c.id, { description: e.target.value })}
            className={cx(inputCls, 'resize-none py-2.5 text-sm leading-relaxed')}
          />
        </Field>
      </div>
      <MannerFields manner={c.manner} expression={c.expression} flowName={c.flowName} onChange={(p) => updateCharacter(c.id, p)} />
      <div className="flex items-center gap-2.5">
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
          Удалить персонажа
        </Button>
        <div className="flex-1" />
        <Button icon={<Upload className="size-4" />} disabled={running} onClick={() => void upload()}>
          Загрузить свой лист
        </Button>
        {sheet && (
          <Button icon={<RefreshCw className="size-4" />} loading={running} onClick={() => void generate()}>
            Пересоздать лист
          </Button>
        )}
        <Button variant="ink" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Modal>
  )
}
