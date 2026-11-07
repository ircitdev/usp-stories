import { useEffect, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import type { UsagePeriod, UsageReport, UsageTotals } from '@shared/types'
import { Segmented, cx } from './ui'

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: 'all', label: 'Всё время' },
  { id: 'month', label: 'Этот месяц' },
  { id: 'week', label: '7 дней' }
]

export const usd = (n: number): string => (n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const num = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString('ru-RU')} тыс.` : Math.round(n).toLocaleString('ru-RU')
const minutes = (s: number): string => (s < 60 ? `${Math.round(s)} с` : s < 3600 ? `${Math.round(s / 60)} мин` : `${(s / 3600).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`)

/** Each service's own units, for one line of a table: «120 кредитов · 30 бонусов · 4 мин видеокарты». */
function units(t: UsageTotals): string {
  return [
    t.credits ? `${num(t.credits)} кредитов Higgsfield` : '',
    t.bonuses ? `${t.bonusesApprox ? '~' : ''}${num(t.bonuses)} бонусов Flow` : '',
    t.chars ? `${num(t.chars)} символов ElevenLabs` : '',
    t.songs ? `${num(t.songs)} ${t.songs === 1 ? 'трек' : 'треков'}` : '',
    t.gpuSeconds ? `${minutes(t.gpuSeconds)} видеокарты` : ''
  ]
    .filter(Boolean)
    .join(' · ')
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex min-w-[150px] flex-1 flex-col gap-0.5 rounded-xl border border-line bg-paper px-3.5 py-2.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-xl font-bold">{value}</span>
      {note && <span className="text-[11px] text-muted">{note}</span>}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-paper text-left text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cx('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((c, j) => (
                <td key={j} className={cx('px-3 py-2 align-top', j > 0 && 'whitespace-nowrap text-right font-mono text-xs')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * What generation cost: money where the price is known, tokens, and each service's own units (Higgsfield credits,
 * Flow bonuses, ElevenLabs characters, graphics-card time). For a video, a folder, or everything with folders and videos.
 */
export function UsageView({ projectId, folder, overall }: { projectId?: string; folder?: string; overall?: boolean }) {
  const [period, setPeriod] = useState<UsagePeriod>('all')
  const [r, setR] = useState<UsageReport | null>(null)
  const load = (): void => {
    void window.api.usage.report(period, overall ? undefined : { projectId, folder }).then(setR)
  }
  useEffect(load, [period, projectId, folder, overall])
  if (!r) return null
  const t = r.scoped
  const extra = units(t)
  const lines = r.lines
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <Segmented size="sm" value={period} onChange={setPeriod} options={PERIODS} />
        <span className="flex-1" />
        <button type="button" onClick={load} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
          <RefreshCw className="size-3.5" /> Обновить
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tile label="Деньги" value={usd(t.costUsd)} note={t.unpriced ? `ещё ${t.unpriced} вызовов без известной цены` : 'по ценам сервисов'} />
        <Tile label="Токены" value={num(t.inputTokens + t.outputTokens)} note={`вход ${num(t.inputTokens)} · выход ${num(t.outputTokens)}`} />
        {t.credits > 0 && <Tile label="Higgsfield" value={`${num(t.credits)} кр.`} />}
        {t.bonuses > 0 && <Tile label="Google Flow" value={`${t.bonusesApprox ? '~' : ''}${num(t.bonuses)} бонусов`} />}
        {t.gpuSeconds > 0 && <Tile label="Видеокарта" value={minutes(t.gpuSeconds)} note="на этом компьютере, бесплатно" />}
      </div>
      {!t.calls && <p className="text-[13px] text-muted">За этот период расходов нет. Учёт ведётся с 8 ноября 2026 — более ранние генерации не посчитаны.</p>}

      {overall && r.folders.length > 0 && (
        <>
          <span className="text-sm font-semibold">По папкам</span>
          <Table
            head={['Папка', 'Токены', 'Другое', 'Деньги']}
            rows={r.folders.map((f) => [f.name || 'Без папки', num(f.totals.inputTokens + f.totals.outputTokens), units(f.totals) || '—', usd(f.totals.costUsd)])}
          />
        </>
      )}
      {(overall || folder != null) && r.projects.length > 0 && (
        <>
          <span className="text-sm font-semibold">По видео</span>
          <Table
            head={['Видео', 'Токены', 'Другое', 'Деньги']}
            rows={r.projects.map((p) => [
              <span key="t" className="flex flex-col">
                {p.title}
                {overall && p.folder && <span className="text-xs text-muted">{p.folder}</span>}
              </span>,
              num(p.totals.inputTokens + p.totals.outputTokens),
              units(p.totals) || '—',
              usd(p.totals.costUsd)
            ])}
          />
        </>
      )}
      {lines.length > 0 && (
        <>
          <span className="text-sm font-semibold">По сервисам и моделям</span>
          <Table
            head={['Сервис', 'Вызовов', 'Токены', 'Другое', 'Деньги']}
            rows={lines.map((l) => [
              <span key="s" className="flex flex-col">
                {l.service}
                <span className="text-xs text-muted">
                  {[l.kind, l.model].filter(Boolean).join(' · ')}
                </span>
              </span>,
              num(l.totals.calls),
              l.totals.inputTokens + l.totals.outputTokens ? num(l.totals.inputTokens + l.totals.outputTokens) : '—',
              units(l.totals) || '—',
              l.totals.costUsd || l.totals.unpriced === 0 ? usd(l.totals.costUsd) : 'цена неизвестна'
            ])}
          />
        </>
      )}
      {extra && <p className="text-xs text-muted">Итого в единицах сервисов: {extra}.</p>}
      <p className="text-xs text-muted">
        Деньги считаются по ценам Gemini API (Gemini 3.8 Flash — $0,75 / $3,75 за 1 млн токенов, озвучка — $0,50 / $9, Lyria — $0,04–0,08 за трек; с 1 января 2027 Gemini
        3.8 вдвое дороже), по ответам OpenRouter и по оценке Higgsfield. Flow, Gemini в Chrome и ElevenLabs идут по подписке — считаются в их единицах.
      </p>
    </div>
  )
}
