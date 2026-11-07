export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function timecode(sec: number): string {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`
}

export function secLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} с`
}

/** Russian plural form: plural(5, ['сцена', 'сцены', 'сцен']) → 'сцен'. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60000)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ${plural(h, ['час', 'часа', 'часов'])} назад`
  const d = Math.round(h / 24)
  if (d === 1) return 'вчера'
  if (d < 7) return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`
  const w = Math.round(d / 7)
  if (w < 5) return `${w} ${plural(w, ['неделю', 'недели', 'недель'])} назад`
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function clipNumber(i: number): string {
  return String(i + 1).padStart(2, '0')
}

export function errorText(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Higgsfield credits: whole numbers from 10 up, one decimal below. */
export function creditLabel(n: number): string {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('ru-RU')
}

export function usdLabel(n: number): string {
  return `US$${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`
}
