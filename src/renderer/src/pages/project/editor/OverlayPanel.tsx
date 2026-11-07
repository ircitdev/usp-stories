import type { ReactNode } from 'react'
import { ImagePlus, Trash2, Type } from 'lucide-react'
import {
  TEXT_COLORS,
  TEXT_SIZES,
  TEXT_STYLES,
  anchorPoint,
  newImageOverlay,
  newTextOverlay,
  overlayEnd,
  overlayVisible,
  type Anchor
} from '@shared/overlays'
import type { ImageOverlay, Overlay, TextOverlay } from '@shared/types'
import { AutoTextarea } from '../../../components/AutoTextarea'
import { IconButton, Segmented, Switch, cx, inputCls } from '../../../components/ui'
import { errorText, timecode } from '../../../lib/format'
import { useApp } from '../../../store/app'
import { useProject } from '../../../store/project'
import { addOverlay, removeOverlay, updateOverlay, useOverlayUi, usePlayback } from './engine'

const ANCHOR_GRID: Anchor[] = [7, 8, 9, 4, 5, 6, 1, 2, 3]
const ANCHOR_NAMES: Record<Anchor, string> = {
  7: 'Слева сверху',
  8: 'По центру сверху',
  9: 'Справа сверху',
  4: 'Слева по центру',
  5: 'По центру',
  6: 'Справа по центру',
  1: 'Слева снизу',
  2: 'По центру снизу',
  3: 'Справа снизу'
}

const round1 = (n: number): number => Math.round(n * 10) / 10

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-2.5 border-b border-line px-[18px] py-4', className)}>
      <span className="text-sm font-semibold">{title}</span>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="w-20 text-ink-2">{label}</span>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="flex-1" />
      <span className="w-12 text-right font-mono">
        {value}
        {unit}
      </span>
    </label>
  )
}

function PositionGrid({ o, aspect }: { o: Overlay; aspect: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line-2 bg-paper p-1.5" role="group" aria-label="Положение наложения">
        {ANCHOR_GRID.map((a) => {
          const on = o.anchor === a
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              aria-label={ANCHOR_NAMES[a]}
              title={ANCHOR_NAMES[a]}
              onClick={() => updateOverlay(o.id, { anchor: a, ...anchorPoint(a, aspect) })}
              className={cx('flex size-8 items-center justify-center rounded-lg', on ? 'bg-ink' : 'hover:bg-sand')}
            >
              <span className={cx('size-2 rounded-full', on ? 'bg-accent' : 'bg-line-3')} />
            </button>
          )
        })}
      </div>
      <p className="flex-1 text-[13px] leading-snug text-muted">Выберите положение здесь или перетащите наложение прямо в превью.</p>
    </div>
  )
}

function TimeRange({ o, total }: { o: Overlay; total: number }) {
  const whole = o.start === 0 && o.end == null
  const clamp = (v: number): number => Math.min(total, Math.max(0, round1(v)))
  return (
    <>
      <Segmented
        size="sm"
        value={whole ? 'whole' : 'custom'}
        onChange={(v) => {
          if (v === 'whole') return updateOverlay(o.id, { start: 0, end: null })
          const now = usePlayback.getState().t
          const start = clamp(now >= total - 0.5 ? 0 : now)
          updateOverlay(o.id, { start, end: clamp(start + 4) })
        }}
        options={[
          { id: 'whole', label: 'Всё видео' },
          { id: 'custom', label: 'Задать время' }
        ]}
        className="self-start"
      />
      {!whole && (
        <div className="grid grid-cols-2 gap-2">
          {(['start', 'end'] as const).map((k) => {
            const value = k === 'start' ? o.start : overlayEnd(o, total)
            return (
              <label key={k} className="flex flex-col gap-1 text-xs text-ink-2">
                {k === 'start' ? 'Начало (с)' : 'Конец (с)'}
                <input
                  type="number"
                  min={0}
                  max={total}
                  step={0.1}
                  value={value}
                  onChange={(e) => {
                    const v = clamp(Number(e.target.value))
                    if (k === 'start') updateOverlay(o.id, { start: Math.min(v, overlayEnd(o, total) - 0.1) })
                    else updateOverlay(o.id, { end: Math.max(v, o.start + 0.1) })
                  }}
                  className={cx(inputCls, 'h-9 font-mono text-sm')}
                />
                <button
                  type="button"
                  onClick={() => {
                    const now = clamp(usePlayback.getState().t)
                    if (k === 'start') updateOverlay(o.id, { start: Math.min(now, overlayEnd(o, total) - 0.1) })
                    else updateOverlay(o.id, { end: Math.max(now, o.start + 0.1) })
                  }}
                  className="self-start text-xs font-semibold text-accent-dark hover:underline"
                >
                  Взять с позиции курсора
                </button>
              </label>
            )
          })}
        </div>
      )}
    </>
  )
}

function ImageSettings({ o }: { o: ImageOverlay }) {
  return (
    <Section title="Вид картинки">
      <Slider label="Размер" value={Math.round(o.width * 100)} min={4} max={60} unit="%" onChange={(v) => updateOverlay(o.id, { width: v / 100 })} />
      <Slider label="Непрозрачность" value={Math.round(o.opacity * 100)} min={10} max={100} unit="%" onChange={(v) => updateOverlay(o.id, { opacity: v / 100 })} />
    </Section>
  )
}

function TextSettings({ o }: { o: TextOverlay }) {
  const size = TEXT_SIZES.reduce((a, b) => (Math.abs(b.size - o.size) < Math.abs(a.size - o.size) ? b : a))
  return (
    <Section title="Текст">
      <AutoTextarea
        id={`overlay-${o.id}-text`}
        minRows={2}
        value={o.text}
        onChange={(e) => updateOverlay(o.id, { text: e.target.value })}
        placeholder="Введите текст. Enter — новая строка."
        aria-label="Текст наложения"
        className={cx(inputCls, 'py-2 text-sm leading-relaxed')}
      />
      <div className="flex items-center gap-3">
        <span className="w-14 text-[13px] text-ink-2">Размер</span>
        <Segmented size="sm" value={size.id} onChange={(id) => updateOverlay(o.id, { size: TEXT_SIZES.find((s) => s.id === id)!.size })} options={TEXT_SIZES} />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-14 text-[13px] text-ink-2">Стиль</span>
        <Segmented size="sm" value={o.style} onChange={(v) => updateOverlay(o.id, { style: v })} options={TEXT_STYLES} />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-14 text-[13px] text-ink-2">Цвет</span>
        <div className="flex gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              aria-pressed={o.color === c}
              onClick={() => updateOverlay(o.id, { color: c })}
              className={cx('size-7 rounded-full border', o.color === c ? 'border-ink ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-line-3')}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] text-ink-2">Жирный шрифт</span>
        <Switch on={o.bold} onChange={(v) => updateOverlay(o.id, { bold: v })} label="Жирный шрифт" />
      </div>
    </Section>
  )
}

/** The editor's Overlay tab: logos, watermarks and free text placed over the video. */
export function OverlayPanel({ total }: { total: number }) {
  const { project, assets, addAsset } = useProject()
  const { toast } = useApp()
  const selectedId = useOverlayUi((s) => s.selectedId)
  const select = useOverlayUi((s) => s.select)
  if (!project) return null
  const overlays = project.editor.overlays ?? []
  const aspect = project.aspectRatio === '9:16' ? 9 / 16 : 16 / 9
  const sel = overlays.find((o) => o.id === selectedId) ?? null

  const addImage = async (): Promise<void> => {
    try {
      const a = await window.api.assets.pickImage(project.id)
      if (!a) return
      addAsset(a)
      addOverlay(newImageOverlay(a.id, aspect))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const addText = (): void => {
    const now = usePlayback.getState().t
    const start = round1(now >= total - 0.5 ? 0 : now)
    const o = newTextOverlay(start, round1(Math.min(total, start + 4)), aspect)
    addOverlay(o)
    requestAnimationFrame(() => {
      const el = document.getElementById(`overlay-${o.id}-text`) as HTMLTextAreaElement | null
      el?.focus()
      el?.select()
    })
  }

  // Selecting an overlay that is hidden at the playhead jumps to where it shows, so it can be dragged.
  const pick = (o: Overlay): void => {
    select(o.id)
    if (!overlayVisible(o, usePlayback.getState().t, total)) usePlayback.getState().seek(o.start + 0.01)
  }

  // Pictures already in the project's media (Проект › Медиа): added as an overlay in one click.
  const media = Object.values(assets).filter((a) => a.kind === 'overlay')
  const addFromMedia = (assetId: string): void => addOverlay(newImageOverlay(assetId, aspect))

  const label = (o: Overlay): string => (o.kind === 'text' ? o.text.split('\n')[0] || 'Пустой текст' : (assets[o.assetId]?.prompt ?? 'Картинка'))

  return (
    <>
      <Section title="Добавить наложение">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void addImage()}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-line-2 bg-surface px-2 py-3 text-center hover:border-ink-2"
          >
            <ImagePlus className="size-5" />
            <span className="text-[13px] font-semibold">Логотип или картинка</span>
            <span className="text-[11.5px] leading-tight text-muted">Водяной знак, прозрачный PNG</span>
          </button>
          <button
            type="button"
            onClick={addText}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-line-2 bg-surface px-2 py-3 text-center hover:border-ink-2"
          >
            <Type className="size-5" />
            <span className="text-[13px] font-semibold">Текст</span>
            <span className="text-[11.5px] leading-tight text-muted">Заголовок, подпись, призыв</span>
          </button>
        </div>
        {media.length > 0 && (
          <>
            <span className="text-xs text-muted">Из медиа проекта — клик добавляет на видео</span>
            <div className="flex flex-wrap gap-1.5">
              {media.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  title={a.prompt ?? ''}
                  onClick={() => addFromMedia(a.id)}
                  className="flex size-14 items-center justify-center overflow-hidden rounded-lg border border-line-2 bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:12px_12px] hover:border-ink-2"
                >
                  <img src={a.url} alt="" className="max-h-full max-w-full object-contain p-1" />
                </button>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section title="Наложения на видео" className={cx(!sel && 'border-b-0')}>
        {overlays.length ? (
          <div className="flex flex-col gap-1.5">
            {overlays.map((o) => {
              const on = o.id === selectedId
              const asset = o.kind === 'image' ? assets[o.assetId] : null
              return (
                <div
                  key={o.id}
                  className={cx('flex items-center gap-2.5 rounded-xl border px-2 py-1.5', on ? 'border-accent bg-accent-soft' : 'border-line-2 hover:border-ink-2')}
                >
                  <button type="button" onClick={() => pick(o)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#EFEAE2_0_25%,#FFFFFF_0_50%)] bg-[length:10px_10px]">
                      {asset ? <img src={asset.url} alt="" className="max-h-full max-w-full object-contain" /> : <Type className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-semibold">{label(o)}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {o.start === 0 && o.end == null ? 'Всё видео' : `${timecode(o.start)} – ${timecode(overlayEnd(o, total))}`}
                      </span>
                    </span>
                  </button>
                  <IconButton label="Удалить наложение" size={32} className="border-transparent bg-transparent text-bad-ink" onClick={() => removeOverlay(o.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">Наложений пока нет. Добавьте логотип как водяной знак или текст, который появится в нужный момент.</p>
        )}
      </Section>

      {sel && (
        <>
          {sel.kind === 'text' ? <TextSettings o={sel} /> : <ImageSettings o={sel} />}
          <Section title="Положение">
            <PositionGrid o={sel} aspect={aspect} />
          </Section>
          <Section title="Когда показывать" className="border-b-0">
            <TimeRange o={sel} total={total} />
          </Section>
        </>
      )}
    </>
  )
}
