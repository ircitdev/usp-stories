import { useEffect, useState } from 'react'
import { FolderOpen, ImagePlus, Mic, Pencil, Plus, ShieldCheck, Trash2, UserRound, Wand2 } from 'lucide-react'
import type { LibraryCharacter, LibraryCharacterInput, VoiceOption, VoiceSample } from '@shared/types'
import { AppearanceTip, PortraitTip, SheetTip } from '../components/CharacterTips'
import { TipLabel } from '../components/InfoTip'
import { MannerFields } from '../components/MannerFields'
import { VideoCharacterImport } from '../components/VideoCharacterImport'
import { Select } from '../components/Select'
import { Badge, Button, Field, Modal, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'

/**
 * Settings › Персонажи: our own recurring characters, shared with the video tools through
 * C:\AI\video-kit\characters.json. Each one has an appearance for the prompts, a portrait (and optionally a full
 * model sheet) that becomes their sheet in a project, and a VoiceStudio voice, picked or cloned right here.
 */
export function LibrarySection() {
  const { toast } = useApp()
  const [items, setItems] = useState<LibraryCharacter[] | null>(null)
  const [editing, setEditing] = useState<LibraryCharacter | 'new' | null>(null)
  const [where, setWhere] = useState<{ file: string; folder: string } | null>(null)
  const loadWhere = (): void => void window.api.library.folder().then(setWhere)
  useEffect(loadWhere, [])
  const pickFolder = async (): Promise<void> => {
    try {
      const list = await window.api.library.pickFolder()
      if (!list) return
      setItems(list)
      loadWhere()
      toast('success', list.length ? `Библиотека: ${list.length} персонажей` : 'Новая пустая библиотека создана')
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const load = (): void => {
    void window.api.library
      .list()
      .then(setItems)
      .catch((e) => {
        toast('error', errorText(e))
        setItems([])
      })
  }
  useEffect(load, [])

  const remove = async (c: LibraryCharacter): Promise<void> => {
    const ok = await confirmDialog({
      title: `Удалить «${c.name}» из библиотеки?`,
      body: 'Персонаж пропадёт из списка. Его картинки и голос в VoiceStudio останутся, а в уже созданных проектах он не изменится.',
      confirm: 'Удалить',
      danger: true
    })
    if (!ok) return
    try {
      setItems(await window.api.library.remove(c.id))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <div>
        <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Персонажи</h1>
        <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
          Наши постоянные герои: внешность, портрет или лист персонажа и голос. В проекте их добавляют в окне «Новый персонаж» › «Из нашей библиотеки».
          Список общий с остальными инструментами.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px]">
          <FolderOpen className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2" title={where?.file}>
            {where?.file ?? '…'}
          </span>
          <Button size="sm" onClick={() => void window.api.library.openFolder()}>
            Открыть папку
          </Button>
          <Button size="sm" onClick={() => void pickFolder()}>
            Выбрать папку
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(items ?? []).map((c) => (
          <div key={c.id} className="flex gap-3.5 rounded-2xl border border-line bg-surface p-3.5">
            {c.thumb ? (
              <img src={c.thumb} alt="" className="size-[88px] shrink-0 rounded-xl object-cover object-top" />
            ) : (
              <span className="flex size-[88px] shrink-0 items-center justify-center rounded-xl bg-sand">
                <UserRound className="size-7 text-muted" />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-base font-bold">{c.name}</span>
              {c.role && <span className="truncate text-[13px] text-ink-2">{c.role}</span>}
              <div className="mt-0.5 flex flex-wrap gap-1.5">
                {c.voiceName ? (
                  <Badge tone="info">
                    <Mic className="size-3" /> {c.voiceName}
                  </Badge>
                ) : (
                  <Badge tone="draft">без голоса</Badge>
                )}
                {c.realPerson && (
                  <Badge tone="ok">
                    <ShieldCheck className="size-3" /> реальный человек, согласие есть
                  </Badge>
                )}
                {c.modelSheetPath && <Badge tone="draft">лист персонажа</Badge>}
              </div>
              <div className="mt-auto flex gap-1.5 pt-1.5">
                <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(c)}>
                  Изменить
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => void remove(c)}>
                  Удалить
                </Button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-[116px] flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line-3 bg-paper text-[15px] font-semibold hover:border-ink"
        >
          <Plus className="size-5" />
          Добавить персонажа
        </button>
      </div>
      {editing && (
        <LibraryEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(list) => {
            setItems(list)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

const LOOK_HINT =
  'По-английски, как для генератора картинок: возраст, телосложение, лицо, волосы, одежда по умолчанию. Например: man in his early forties, short ginger beard, pink knit beanie, black denim overshirt.'

function LibraryEditor({ initial, onClose, onSaved }: { initial: LibraryCharacter | null; onClose: () => void; onSaved: (list: LibraryCharacter[]) => void }) {
  const { toast } = useApp()
  const [form, setForm] = useState<LibraryCharacterInput>({
    id: initial?.id,
    name: initial?.name ?? '',
    role: initial?.role ?? '',
    description: initial?.description ?? '',
    manner: initial?.manner ?? '',
    expression: initial?.expression ?? '',
    flowName: initial?.flowName ?? '',
    realPerson: initial?.realPerson ?? false,
    consentGiven: initial?.realPerson ?? false,
    imagePath: initial?.imagePath ?? null,
    modelSheetPath: initial?.modelSheetPath ?? null,
    voiceId: initial?.voiceId ?? null,
    voiceName: initial?.voiceName ?? null
  })
  const [thumbs, setThumbs] = useState<{ image: string | null; sheet: string | null }>({ image: initial?.thumb ?? null, sheet: initial?.sheetThumb ?? null })
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [sample, setSample] = useState<(VoiceSample & { busy?: boolean }) | null>(null)
  const [sampleText, setSampleText] = useState('')
  const [cloning, setCloning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [carding, setCarding] = useState(false)
  const makeCard = async (): Promise<void> => {
    if (!form.imagePath) return
    setCarding(true)
    try {
      const r = await window.api.library.makeCard(form.imagePath)
      setForm((f) => ({ ...f, imagePath: r.portrait, modelSheetPath: r.sheet }))
      setThumbs({ image: r.portraitThumb, sheet: r.sheetThumb })
      toast('success', 'Портрет и лист персонажа готовы — сохраните персонажа')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setCarding(false)
    }
  }
  const set = (patch: Partial<LibraryCharacterInput>): void => setForm((f) => ({ ...f, ...patch }))

  const loadVoices = (): void => {
    void window.api.settings
      .voices('voicestudio')
      .then(setVoices)
      .catch(() => setVoices([]))
  }
  useEffect(loadVoices, [])

  const pickImage = async (which: 'image' | 'sheet'): Promise<void> => {
    const r = await window.api.library.pickFile('image')
    if (!r) return
    if (which === 'image') set({ imagePath: r.path })
    else set({ modelSheetPath: r.path })
    setThumbs((t) => ({ ...t, [which]: r.thumb }))
  }

  const pickVoiceFile = async (): Promise<void> => {
    const r = await window.api.library.pickFile('audio')
    if (!r) return
    setSample({ path: r.path, text: null, whisper: false, busy: true })
    try {
      const s = await window.api.library.prepareVoice(r.path)
      setSample(s)
      setSampleText(s.text ?? '')
    } catch (e) {
      setSample(null)
      toast('error', errorText(e))
    }
  }

  const clone = async (): Promise<void> => {
    if (!sample || !sampleText.trim()) return
    setCloning(true)
    try {
      const v = await window.api.library.cloneVoice(form.name.trim() || 'Новый голос', sample.path, sampleText.trim())
      set({ voiceId: v.id, voiceName: v.name })
      setSample(null)
      loadVoices()
      toast('success', `Голос «${v.name}» создан в VoiceStudio`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setCloning(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      onSaved(await window.api.library.save(form))
      toast('success', `«${form.name.trim()}» сохранён в библиотеке`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const voiceOptions = [
    { value: '', label: 'Без голоса' },
    ...(voices ?? []).map((v) => ({ value: v.id, label: v.name, hint: v.description }))
  ]
  if (form.voiceId && !voiceOptions.some((o) => o.value === form.voiceId)) voiceOptions.push({ value: form.voiceId, label: form.voiceName ?? form.voiceId, hint: '' })
  const canSave = !!form.name.trim() && (!form.realPerson || form.consentGiven) && !saving

  const picture = (which: 'image' | 'sheet', label: string, path: string | null | undefined) => {
    const thumb = which === 'image' ? thumbs.image : thumbs.sheet
    return (
      <button
        type="button"
        onClick={() => void pickImage(which)}
        className="flex h-[150px] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-[1.5px] border-dashed border-line-3 bg-paper text-[13px] text-ink-2 hover:border-ink"
      >
        {thumb ? (
          <img src={thumb} alt="" className="size-full object-contain" />
        ) : (
          <>
            <ImagePlus className="size-5" />
            {label}
            {path && <span className="max-w-full truncate px-3 text-[11px]">{path.split(/[\\/]/).pop()}</span>}
          </>
        )}
      </button>
    )
  }

  return (
    <Modal open onClose={onClose} title={initial ? `Персонаж: ${initial.name}` : 'Новый персонаж в библиотеке'} subtitle="Портрет, внешность и голос. Всё хранится на этом компьютере." width={820}>
      <VideoCharacterImport
        name={form.name}
        onResult={(r, o) => {
          setForm((f) => ({
            ...f,
            description: r.description || f.description,
            manner: r.manner || f.manner,
            expression: r.expression || f.expression,
            role: f.role || r.role,
            imagePath: r.portraitPath,
            ...(o.card ? { modelSheetPath: r.sheetPath } : {}),
            ...(r.voiceId ? { voiceId: r.voiceId, voiceName: r.voiceName } : {}),
            realPerson: true
          }))
          setThumbs((t) => ({ image: r.portraitThumb ?? t.image, sheet: o.card ? (r.sheetThumb ?? t.sheet) : t.sheet }))
          if (r.voiceId) loadVoices()
        }}
      />
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <Field
          label={
            <TipLabel text="Портрет">
              <PortraitTip />
            </TipLabel>
          }
        >
          {picture('image', 'Выбрать портрет', form.imagePath)}
        </Field>
        <Field
          label={
            <TipLabel text="Лист персонажа (необязательно)">
              <SheetTip />
            </TipLabel>
          }
        >
          {picture('sheet', 'Ракурсы, эмоции, детали одежды', form.modelSheetPath)}
        </Field>
      </div>
      {form.imagePath && (
        <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
          <Button size="sm" icon={<Wand2 className="size-4" />} loading={carding} onClick={() => void makeCard()}>
            Сделать карту из портрета
          </Button>
          <span>{carding ? 'Qwen-Image 2.1 рисует студийный портрет и лист… около минуты' : 'Студийный портрет и лист ракурсов по портрету — на этом компьютере.'}</span>
        </div>
      )}
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <Field label="Имя">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например: Иван Колосов" className={cx(inputCls, 'h-11')} />
        </Field>
        <Field label="Роль">
          <input
            value={form.role ?? ''}
            onChange={(e) => set({ role: e.target.value })}
            placeholder="Например: генеральный продюсер кэмпа"
            className={cx(inputCls, 'h-11')}
          />
        </Field>
      </div>
      <Field
        label={
          <TipLabel text="Внешность">
            <AppearanceTip />
          </TipLabel>
        }
        hint={LOOK_HINT}
      >
        <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={cx(inputCls, 'resize-none py-2.5 text-sm leading-relaxed')} />
      </Field>
      <MannerFields manner={form.manner ?? ''} expression={form.expression ?? ''} flowName={form.flowName ?? ''} onChange={set} />

      <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-paper p-3.5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Mic className="size-4" /> Голос (VoiceStudio)
        </span>
        <div className="flex gap-2">
          <Select
            label="Голос персонажа"
            value={form.voiceId ?? ''}
            options={voiceOptions}
            onChange={(v) => set({ voiceId: v || null, voiceName: v ? (voiceOptions.find((o) => o.value === v)?.label ?? null) : null })}
            className="flex-1"
          />
          <Button icon={<Wand2 className="size-4" />} onClick={() => void pickVoiceFile()} loading={!!sample?.busy}>
            Клонировать из файла…
          </Button>
        </div>
        {voices && !voices.length && <span className="text-[13px] text-ink-2">VoiceStudio не отвечает — откройте приложение, чтобы выбрать или клонировать голос.</span>}
        {sample && !sample.busy && (
          <div className="flex flex-col gap-2 border-t border-dashed border-line pt-2.5">
            <span className="text-[13px] text-ink-2">
              Образец — первые 10 секунд записи. Впишите дословно, что в нём звучит
              {sample.whisper ? ' (текст распознан Whisper, проверьте)' : ' (Whisper не скачан — текст нужно ввести вручную)'}:
            </span>
            <textarea rows={2} value={sampleText} onChange={(e) => setSampleText(e.target.value)} className={cx(inputCls, 'resize-none py-2 text-sm')} />
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setSample(null)}>
                Отмена
              </Button>
              <Button size="sm" variant="accent" loading={cloning} disabled={!sampleText.trim()} onClick={() => void clone()}>
                Создать голос
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={form.realPerson} onChange={(e) => set({ realPerson: e.target.checked, consentGiven: e.target.checked ? form.consentGiven : false })} />
          Это реальный человек
        </label>
        {form.realPerson && (
          <label className="flex cursor-pointer items-start gap-2 pl-6 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={form.consentGiven} onChange={(e) => set({ consentGiven: e.target.checked })} />
            Человек согласен, что его внешность и голос используются в роликах (без согласия сохранить нельзя).
          </label>
        )}
      </div>

      <div className="flex items-center justify-end gap-2.5">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" disabled={!canSave} loading={saving} onClick={() => void save()}>
          Сохранить
        </Button>
      </div>
    </Modal>
  )
}
