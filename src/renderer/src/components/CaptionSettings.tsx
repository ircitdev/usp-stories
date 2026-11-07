import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bookmark, Plus, Upload, X } from 'lucide-react'
import { errorText } from '../lib/format'
import { applyUserFonts } from '../lib/userFonts'
import { useApp } from '../store/app'
import {
  CAPTION_ANIMS,
  allCaptionFonts,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  captionLeadingOf,
  captionMotionOf,
  captionScaleOf,
  getCaptionFont,
  resolveCaption,
  type CaptionChunk,
  type CaptionFont
} from '@shared/captions'
import type { AspectRatio, CaptionPreset, CaptionStyleId, EditorSettings } from '@shared/types'
import { CaptionOverlay } from '../pages/project/editor/Player'
import { Select } from './Select'
import { Segmented, Switch, cx } from './ui'

/** The caption fields of the editor settings: a project's own, or the defaults for new projects. */
export type CaptionLook = Pick<
  EditorSettings,
  | 'captionStyle'
  | 'captionPosition'
  | 'captionSize'
  | 'captionScale'
  | 'captionLineHeight'
  | 'captionFont'
  | 'captionColor'
  | 'captionHighlight'
  | 'captionBg'
  | 'captionLastStyle'
  | 'captionAnim'
  | 'captionByWord'
  | 'captionByLetter'
>

const TEXT_SWATCHES = ['#FFFFFF', '#1F1D1A', '#FFC93C', '#E4572E', '#4DABF7', '#51CF66', '#F783AC']
const BOX_SWATCHES = ['#1F1D1A', '#FFFFFF', '#C93A1B', '#FFC93C', '#1E4A7A', '#25572B']
const SAMPLE = 'Новый год, снег, мандарины… а ваш ребёнок — герой праздника'

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2.5 border-b border-line px-[18px] py-4', className)}>
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}

/** A row of colour dots plus a free colour picker. */
export function Swatches({ value, colors, label, onChange }: { value: string | null; colors: string[]; label: string; onChange: (c: string) => void }) {
  const custom = !!value && !colors.some((c) => c.toLowerCase() === value.toLowerCase())
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((c) => {
        const on = value?.toLowerCase() === c.toLowerCase()
        return (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            aria-pressed={on}
            onClick={() => onChange(c)}
            className={cx('size-7 rounded-full border', on ? 'border-ink ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-line-3')}
            style={{ background: c }}
          />
        )
      })}
      <label
        title="Другой цвет"
        className={cx(
          'relative size-7 cursor-pointer overflow-hidden rounded-full border',
          custom ? 'border-ink ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-line-3'
        )}
        style={{ background: custom ? value! : 'conic-gradient(#e03131, #ffd43b, #51cf66, #22b8cf, #4c6ef5, #cc5de8, #e03131)' }}
      >
        <input
          type="color"
          value={value ?? '#ffffff'}
          onChange={(ev) => onChange(ev.target.value.toUpperCase())}
          aria-label={`${label}: другой`}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  )
}

/**
 * A frame of the video with the caption drawn exactly as the player and the export draw it (same layout, size,
 * line spacing and colours), the highlighted word moving along as if the voice were speaking.
 */
export function CaptionPreview({ look, aspect, image, text, width }: { look: CaptionLook; aspect: AspectRatio; image?: string | null; text?: string; width: number }) {
  const height = Math.round(aspect === '9:16' ? (width * 16) / 9 : (width * 9) / 16)
  const words = useMemo(() => (text?.trim() || SAMPLE).split(/\s+/).slice(0, 8), [text])
  const chunk: CaptionChunk = useMemo(
    () => ({ start: 0, end: words.length * 0.45, words: words.map((w, i) => ({ text: w, start: i * 0.45, end: (i + 1) * 0.45 })) }),
    [words]
  )
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setT((v) => (v + 0.15) % (words.length * 0.45)), 150)
    return () => window.clearInterval(id)
  }, [words.length])
  const editor = { ...look, captionSize: look.captionSize ?? 'sedang' } as EditorSettings
  return (
    <div
      className="relative mx-auto overflow-hidden rounded-xl border border-ink bg-[linear-gradient(160deg,#3b4a63,#1d2433_55%,#4a3a2e)]"
      style={{ width, height }}
    >
      {image && <img src={image} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />}
      {look.captionStyle === 'none' ? (
        <span className="absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-white/80">Субтитры выключены</span>
      ) : (
        <CaptionOverlay chunks={[chunk]} t={t} editor={editor} width={width} height={height} />
      )}
    </div>
  )
}

/** The look a preset keeps: everything about the captions except the off switch's memory. */
const PRESET_KEYS = [
  'captionStyle',
  'captionPosition',
  'captionSize',
  'captionScale',
  'captionLineHeight',
  'captionFont',
  'captionColor',
  'captionHighlight',
  'captionBg',
  'captionAnim',
  'captionByWord',
  'captionByLetter'
] as const

/** Saved caption looks, shared by every project and the defaults (AppSettings.captionPresets). */
function Presets({ look, onChange }: { look: CaptionLook; onChange: (patch: Partial<CaptionLook>) => void }) {
  const [presets, setPresets] = useState<CaptionPreset[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  useEffect(() => {
    void window.api.settings.get().then((s) => setPresets(s.captionPresets ?? []))
  }, [])
  const store = (next: CaptionPreset[]): void => {
    setPresets(next)
    void window.api.settings.set({ captionPresets: next })
  }
  const current = (): Partial<CaptionLook> => {
    const out: Record<string, unknown> = {}
    // Unset fields are written as undefined too, so applying a preset also clears what it does not use.
    for (const k of PRESET_KEYS) out[k] = look[k]
    return out as Partial<CaptionLook>
  }
  // Fields the preset leaves unset go back to the style's own (saved JSON drops undefined values).
  const apply = (p: CaptionPreset): void =>
    onChange({ ...(Object.fromEntries(PRESET_KEYS.map((k) => [k, undefined])) as Partial<CaptionLook>), ...(p.look as Partial<CaptionLook>) })
  const same = (p: CaptionPreset): boolean => PRESET_KEYS.every((k) => JSON.stringify(p.look[k] ?? null) === JSON.stringify(look[k] ?? null))
  const save = (): void => {
    const name = (naming ?? '').trim()
    if (!name) return
    store([...presets.filter((p) => p.name !== name), { id: `${Date.now()}`, name, look: current() as CaptionPreset['look'] }])
    setNaming(null)
  }
  return (
    <Section title="Пресеты">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <span
            key={p.id}
            className={cx(
              'inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-[13px]',
              same(p) ? 'border-accent bg-accent-soft font-semibold' : 'border-line-2 hover:border-ink-2'
            )}
          >
            <button type="button" onClick={() => apply(p)} title="Применить пресет">
              {p.name}
            </button>
            <button
              type="button"
              aria-label={`Удалить пресет ${p.name}`}
              onClick={() => store(presets.filter((x) => x.id !== p.id))}
              className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-bad-ink"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {naming === null ? (
          <button
            type="button"
            onClick={() => setNaming('')}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-3 px-3 py-1 text-[13px] text-ink-2 hover:border-ink-2"
          >
            <Plus className="size-3.5" /> Сохранить текущий
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={naming}
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setNaming(null)
              }}
              placeholder="Название пресета"
              className="h-8 w-44 rounded-lg border border-line-2 bg-surface px-2.5 text-[13px]"
            />
            <button type="button" onClick={save} className="text-[13px] font-semibold text-accent-dark hover:underline">
              Сохранить
            </button>
          </span>
        )}
      </div>
      {!presets.length && naming === null && (
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Bookmark className="size-3.5" /> Настройте субтитры и сохраните — пресет можно применить в любом проекте одним кликом.
        </span>
      )}
    </Section>
  )
}

/** Load a TTF/OTF of one's own; remove the selected one if it is a loaded font. */
function FontUpload({ current, onPicked }: { current: CaptionFont; onPicked: (id: string) => void }) {
  const { toast } = useApp()
  const [, redraw] = useState(0)
  const add = async (): Promise<void> => {
    try {
      const r = await window.api.fonts.add()
      if (!r) return
      await applyUserFonts(r.fonts)
      redraw((n) => n + 1)
      if (r.added) onPicked(r.added)
      const f = r.fonts.find((x) => x.id === r.added)
      toast(f?.cyrillic === false ? 'info' : 'success', f ? `Шрифт «${f.name}» добавлен${f.cyrillic === false ? ' — в нём нет русских букв' : ''}` : 'Шрифт добавлен')
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const remove = async (): Promise<void> => {
    const list = await window.api.fonts.remove(current.id)
    await applyUserFonts(list)
    onPicked('golos')
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <button type="button" onClick={() => void add()} className="inline-flex items-center gap-1.5 font-semibold text-accent-dark hover:underline">
        <Upload className="size-3.5" /> Загрузить свой шрифт (TTF, OTF)
      </button>
      {current.user && (
        <button type="button" onClick={() => void remove()} className="text-muted hover:text-bad-ink">
          · убрать «{current.name}» из списка
        </button>
      )}
    </div>
  )
}

/** Every caption setting with a live preview on top. `onChange` gets only the changed fields. */
export function CaptionSettings({
  look,
  onChange,
  aspect,
  image,
  text,
  previewWidth,
  hidePreview
}: {
  look: CaptionLook
  onChange: (patch: Partial<CaptionLook>) => void
  aspect: AspectRatio
  image?: string | null
  text?: string
  previewWidth: number
  /** The page shows the preview elsewhere (Settings › Субтитры: in the left column, always in view). */
  hidePreview?: boolean
}) {
  const on = look.captionStyle !== 'none'
  const r = on ? resolveCaption(look) : null
  const setOn = (v: boolean): void =>
    onChange(v ? { captionStyle: look.captionLastStyle ?? 'karaoke' } : { captionStyle: 'none', captionLastStyle: look.captionStyle as CaptionStyleId })
  return (
    <>
      <Section title="Субтитры">
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-2">{on ? 'Показываются в превью и в готовом видео' : 'Выключены: в готовое видео не попадут'}</span>
          <Switch on={on} onChange={setOn} label="Показывать субтитры" />
        </label>
        {!hidePreview && <CaptionPreview look={look} aspect={aspect} image={image} text={text} width={previewWidth} />}
      </Section>
      <Presets look={look} onChange={onChange} />
      {on && r && (
        <>
          <Section title="Стиль">
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_STYLES.map((s) => {
                const active = look.captionStyle === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange({ captionStyle: s.id, captionColor: undefined, captionHighlight: undefined, captionBg: undefined })}
                    className="flex flex-col gap-1 text-left"
                  >
                    <span className={cx('flex h-[52px] w-full items-center justify-center rounded-[10px] bg-[#E99A5B]', active ? 'border-2 border-accent' : 'border border-ink')}>
                      <span
                        className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px]"
                        style={{
                          fontFamily: `'${r.fontInfo.family}', sans-serif`,
                          fontWeight: s.weight,
                          color: s.color,
                          background: s.box ?? 'transparent',
                          WebkitTextStroke: s.box ? undefined : `0.8px ${s.outlineColor}`,
                          paintOrder: 'stroke fill'
                        }}
                      >
                        {s.uppercase ? 'ИСТОРИЯ' : 'История'} <span style={{ color: s.highlight }}>{s.uppercase ? 'ОЖИВАЕТ' : 'оживает'}</span>
                      </span>
                    </span>
                    <span className="text-xs font-medium text-ink-2">{s.name}</span>
                  </button>
                )
              })}
            </div>
          </Section>
          <Section title="Анимация">
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-ink-2">Появление</span>
              <Segmented
                size="sm"
                value={captionMotionOf(look).byLetter ? 'letter' : captionMotionOf(look).byWord ? 'word' : 'card'}
                onChange={(v) =>
                  onChange({
                    captionByWord: v !== 'card',
                    captionByLetter: v === 'letter',
                    ...(look.captionAnim === 'words' ? { captionAnim: 'none' as const } : {})
                  })
                }
                options={[
                  { id: 'card', label: 'Карточкой' },
                  { id: 'word', label: 'По словам' },
                  { id: 'letter', label: 'По буквам' }
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_ANIMS.map((a) => {
                const active = captionMotionOf(look).anim === a.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={active}
                    title={a.hint}
                    onClick={() => onChange({ captionAnim: a.id, ...(look.captionAnim === 'words' ? { captionByWord: true } : {}) })}
                    className={cx(
                      'flex flex-col items-start gap-0.5 rounded-[10px] px-3 py-2 text-left',
                      active ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 hover:border-ink-2'
                    )}
                  >
                    <span className="text-[13px] font-semibold">{a.label}</span>
                    <span className="text-[11px] leading-snug text-muted">{a.hint}</span>
                  </button>
                )
              })}
            </div>
          </Section>
          <Section title="Шрифт">
            <Select
              label="Шрифт субтитров"
              size="sm"
              value={getCaptionFont(look.captionFont).id}
              onChange={(v) => onChange({ captionFont: v })}
              options={allCaptionFonts().map((f) => ({
                value: f.id,
                label: f.name,
                group: f.group,
                // Each option is written in its own font.
                labelStyle: { fontFamily: `'${f.family}', sans-serif`, fontSize: 17, fontWeight: f.id === 'poppins' ? 700 : 400 }
              }))}
            />
            <FontUpload current={getCaptionFont(look.captionFont)} onPicked={(id) => onChange({ captionFont: id })} />
            {!getCaptionFont(look.captionFont).cyrillic && (
              <span className="text-xs text-sun-ink">В этом шрифте нет русских букв: они выйдут другим шрифтом. Для русского текста — Golos Text.</span>
            )}
          </Section>
          <Section title="Цвет текста">
            <Swatches value={r.color} colors={TEXT_SWATCHES} label="Цвет текста" onChange={(c) => onChange({ captionColor: c })} />
            <span className="text-xs text-muted">Слово, которое звучит сейчас</span>
            <Swatches value={r.highlight} colors={TEXT_SWATCHES} label="Цвет выделения" onChange={(c) => onChange({ captionHighlight: c })} />
          </Section>
          <Section title="Подложка">
            <Segmented
              size="sm"
              value={r.box ? 'on' : 'off'}
              onChange={(v) => onChange({ captionBg: v === 'off' ? null : { color: r.box ?? '#1F1D1A', opacity: r.box ? r.boxAlpha : 0.85 } })}
              options={[
                { id: 'on', label: 'Плашка' },
                { id: 'off', label: 'Без подложки' }
              ]}
              className="self-start"
            />
            {r.box ? (
              <>
                <Swatches value={r.box} colors={BOX_SWATCHES} label="Цвет подложки" onChange={(c) => onChange({ captionBg: { color: c, opacity: r.boxAlpha } })} />
                <Slider
                  label="Непрозрачность"
                  min={15}
                  max={100}
                  value={Math.round(r.boxAlpha * 100)}
                  onChange={(v) => onChange({ captionBg: { color: r.box!, opacity: v / 100 } })}
                />
              </>
            ) : (
              <span className="text-xs text-muted">Без подложки у текста появится обводка, чтобы он читался.</span>
            )}
          </Section>
          <Section title="Положение">
            <Segmented value={look.captionPosition} onChange={(v) => onChange({ captionPosition: v })} options={CAPTION_POSITIONS} />
          </Section>
          <Section title="Размер и интервал" className="border-b-0">
            <Slider
              label="Размер"
              min={30}
              max={180}
              value={Math.round(captionScaleOf({ captionSize: look.captionSize ?? 'sedang', captionScale: look.captionScale }) * 100)}
              onChange={(v) => onChange({ captionScale: v / 100 })}
            />
            <Slider
              label="Межстрочный"
              min={60}
              max={150}
              value={Math.round(captionLeadingOf(look) * 100)}
              onChange={(v) => onChange({ captionLineHeight: v / 100 })}
            />
            <button
              type="button"
              onClick={() => onChange({ captionScale: 1, captionSize: 'sedang', captionLineHeight: undefined })}
              className="self-start text-xs font-semibold text-accent-dark hover:underline"
            >
              Вернуть 100%
            </button>
          </Section>
        </>
      )}
    </>
  )
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="w-24 text-ink-2">{label}</span>
      <input type="range" min={min} max={max} step={5} value={value} onChange={(ev) => onChange(Number(ev.target.value))} aria-label={label} className="flex-1" />
      <span className="w-12 text-right font-mono">{value}%</span>
    </label>
  )
}
