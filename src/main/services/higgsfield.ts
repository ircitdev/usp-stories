import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { app } from 'electron'
import type { CreditEstimate, KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { ApiError, readError, sleep } from './http'

// Development builds can point at a local mock (STUDIO_HF_BASE) to test the UI without spending credits.
const BASE = (!app.isPackaged && process.env.STUDIO_HF_BASE) || 'https://api.higgsfield.ai'

export type HfStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'

export interface HfResult {
  status: HfStatus
  images?: { url: string }[]
  video?: { url: string }
  error?: string
}

function authHeader(cred?: string): string {
  return `Key ${cred ?? requireSecret('higgsfield')}`
}

function friendly(status: number, detail: string): ApiError {
  if (status === 401) return new ApiError('Ключ Higgsfield неверный. Вставьте в настройках заново то, что копирует кнопка «Copy API key» в консоли Higgsfield.', status)
  if (status === 403) return new ApiError('Не хватает кредитов Higgsfield. Пополните баланс в кабинете Higgsfield.', status)
  if (status === 400 && /concurrent/i.test(detail))
    return new ApiError('В Higgsfield запущено слишком много задач одновременно.', status, true)
  if (status === 404 || status === 423 || status === 503)
    return new ApiError(`Эта модель пока недоступна для вашего аккаунта Higgsfield (${detail}).`, status)
  if (status >= 500) return new ApiError(`Проблемы на сервере Higgsfield (${status}).`, status, true)
  return new ApiError(`Higgsfield отклонил запрос: ${detail}`, status)
}

async function hf<T>(path: string, init: RequestInit & { cred?: string } = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(init.cred),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {})
    }
  })
  if (!res.ok) throw friendly(res.status, await readError(res))
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/** Submits a generation. Retries a few times when the account's concurrency limit is hit. */
export async function submit(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const idem = randomUUID()
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await hf<{ request_id: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': idem },
        signal
      })
      return out.request_id
    } catch (e) {
      if (e instanceof ApiError && e.retryable && attempt < 6 && !signal?.aborted) {
        await sleep(4000 + attempt * 3000, signal)
        continue
      }
      throw e
    }
  }
}

export async function getStatus(requestId: string, signal?: AbortSignal): Promise<HfResult> {
  return hf<HfResult>(`requests/${requestId}/status`, { method: 'GET', signal })
}

export async function cancelRequest(requestId: string): Promise<void> {
  try {
    await hf(`requests/${requestId}/cancel`, { method: 'POST' })
  } catch {
    // Already processing: Higgsfield only cancels queued jobs.
  }
}

/** Polls until the request finishes. Starts at 2 s and backs off to 10 s. */
export async function waitForResult(
  requestId: string,
  onTick: (status: HfStatus, elapsedMs: number) => void,
  signal?: AbortSignal,
  timeoutMs = 20 * 60 * 1000
): Promise<HfResult> {
  const started = Date.now()
  let delay = 2000
  let failures = 0
  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error('Higgsfield слишком долго не отвечает. Попробуйте позже.')
    let r: HfResult
    try {
      r = await getStatus(requestId, signal)
      failures = 0
    } catch (e) {
      if (signal?.aborted) throw e
      if (e instanceof ApiError && !e.retryable) throw e
      if (++failures > 8) throw e
      await sleep(delay, signal)
      continue
    }
    onTick(r.status, Date.now() - started)
    if (r.status === 'completed') return r
    if (r.status === 'failed') throw new Error(`Higgsfield не смог выполнить генерацию: ${r.error ?? 'без подробностей'}`)
    if (r.status === 'nsfw') throw new Error('Отклонено модерацией Higgsfield. Измените промпт и попробуйте снова.')
    if (r.status === 'canceled') throw new Error('Отменено')
    await sleep(delay + Math.random() * 500, signal)
    delay = Math.min(10_000, delay * 1.5)
  }
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav'
}

/** Uploads a local file through a presigned URL and returns its public URL for use as a reference. */
export async function uploadFile(absPath: string, signal?: AbortSignal): Promise<string> {
  const contentType = MIME[extname(absPath).toLowerCase()] ?? 'image/png'
  const slot = await hf<{ public_url: string; upload_url: string; upload_headers?: Record<string, string> }>(
    'files/generate-upload-url',
    { method: 'POST', body: JSON.stringify({ content_type: contentType }), signal }
  )
  const bytes = await readFile(absPath)
  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: slot.upload_headers ?? { 'Content-Type': contentType },
    body: bytes,
    signal
  })
  if (!put.ok) throw new Error(`Не удалось загрузить референс в Higgsfield (HTTP ${put.status})`)
  return slot.public_url
}

export async function estimate(endpoint: string, body: Record<string, unknown>): Promise<CreditEstimate | null> {
  try {
    const out = await hf<{ credits?: string | number; usd?: string | number }>(`estimate/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
    const credits = Number(out.credits)
    const usd = Number(out.usd)
    return Number.isFinite(credits) ? { credits, usd: out.usd != null && Number.isFinite(usd) ? usd : null } : null
  } catch (e) {
    console.warn(`[higgsfield] estimate ${endpoint}: ${(e as Error).message}`)
    return null
  }
}

/** A cost estimate is the cheapest authenticated call the API documents. */
export async function testCredentials(cred?: string): Promise<KeyTestResult> {
  const c = cred ?? getSecret('higgsfield')
  if (!c) return { ok: false, message: 'Ключ не задан' }
  try {
    const out = await hf<{ credits?: string }>('estimate/higgsfield-ai/soul/v2/standard', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test', aspect_ratio: '16:9', resolution: '720p', batch_size: 1 }),
      cred: c
    })
    // The API sends credits as "1.500"; show them the Indonesian way ("1,5") so they are not read as thousands.
    const n = Number(out.credits)
    const credits = Number.isFinite(n) ? (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('ru-RU') : null
    return { ok: true, message: credits ? `Подключено · 1 картинка Soul ≈ ${credits} кред.` : 'Подключено' }
  } catch (e) {
    const noColon = !c.includes(':')
    if (e instanceof ApiError && e.status === 401 && noColon)
      return {
        ok: false,
        message: 'Ключ отклонён. Ключ Higgsfield выглядит так: KEY_ID:KEY_SECRET. Нажмите «Copy API key» в консоли или соедините Key ID и Secret через двоеточие.'
      }
    return { ok: false, message: (e as Error).message }
  }
}
