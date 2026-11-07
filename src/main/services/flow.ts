import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { dataDir } from '../paths'
import type { ChromeCheck } from '@shared/types'
import { getSettings } from '../settings'

/**
 * Clip videos through Google Flow open in the user's Chrome: browser-harness drives the Flow tab
 * (resources/flow/flow_clip.py): sends the request to Flow's agent, approves that one request, waits for the new
 * video in the project and downloads it in 720p. Flow spends its own credits ("бонусы") on every video.
 */

function harness(): string {
  const own = getSettings().browserHarness?.trim()
  if (own) return own
  const local = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'browser-harness.exe' : 'browser-harness')
  return existsSync(local) ? local : 'browser-harness'
}

function script(): string {
  return app.isPackaged ? join(process.resourcesPath, 'flow', 'flow_clip.py') : join(app.getAppPath(), 'resources', 'flow', 'flow_clip.py')
}

export interface FlowResult {
  bytes: Buffer
  label: string | null
  approved: string | null
  /** The whole approval request of Flow's agent (it names the bonuses it spends). */
  approvedText: string | null
}

export function makeVideo(prompt: string, signal: AbortSignal, onProgress: (message: string) => void): Promise<FlowResult> {
  const dir = join(dataDir(), 'tmp', 'flow')
  mkdirSync(dir, { recursive: true })
  const stamp = `${Date.now()}`
  const promptFile = join(dir, `prompt-${stamp}.txt`)
  const out = join(dir, `clip-${stamp}.mp4`)
  writeFileSync(promptFile, prompt, 'utf8')
  return new Promise((resolve, reject) => {
    const child = spawn(harness(), [], {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        FLOW_PROMPT: promptFile,
        FLOW_OUT: out,
        FLOW_PROJECT: getSettings().flowProjectUrl ?? '',
        FLOW_TIMEOUT: '900'
      }
    })
    const onAbort = (): void => void child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    let result: { ok: boolean; error?: string; label?: string; approved?: string; approved_text?: string } | null = null
    let buf = ''
    let errText = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buf += chunk
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        const m = /^(PROGRESS|RESULT) (.*)$/.exec(line)
        if (!m) continue
        try {
          const data = JSON.parse(m[2])
          if (m[1] === 'PROGRESS') onProgress(String(data.message ?? ''))
          else result = data
        } catch {
          // a line that only looks like ours
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => (errText = (errText + c).slice(-4000)))
    child.on('error', (e) =>
      reject(new Error(`Не удалось запустить browser-harness (${harness()}): ${e.message}. Укажите путь в Настройках › Локальные модели.`))
    )
    child.on('close', () => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return reject(new Error('Отменено'))
      if (result?.ok && existsSync(out))
        return resolve({ bytes: readFileSync(out), label: result.label ?? null, approved: result.approved ?? null, approvedText: result.approved_text ?? null })
      const last = errText.trim().split('\n').slice(-2).join(' ')
      reject(new Error(result?.error ?? (last ? `Google Flow: ${last}` : 'Google Flow не вернул видео')))
    })
    child.stdin.end(readFileSync(script(), 'utf8'))
  })
}


/** Checks the Chrome side without opening or creating anything (resources/chrome/check.py). */
export function checkChrome(): Promise<ChromeCheck> {
  const file = app.isPackaged ? join(process.resourcesPath, 'chrome', 'check.py') : join(app.getAppPath(), 'resources', 'chrome', 'check.py')
  return new Promise((resolve) => {
    const fail = (error: string, harnessOk = false): void =>
      resolve({ harness: harnessOk, chrome: false, flowTabs: [], flowMatch: null, geminiTab: false, signedIn: null, error })
    let out = ''
    let err = ''
    const child = spawn(harness(), [], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', FLOW_PROJECT: getSettings().flowProjectUrl ?? '' }
    })
    const timer = setTimeout(() => child.kill(), 45_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      fail(`browser-harness не найден (${harness()}): ${e.message}`)
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (c: string) => (out += c))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => (err = (err + c).slice(-2000)))
    child.on('close', () => {
      clearTimeout(timer)
      const line = out.split('\n').find((l) => l.startsWith('RESULT '))
      if (!line) return fail(err.trim().split('\n').slice(-2).join(' ') || 'browser-harness не ответил', true)
      try {
        resolve({ harness: true, ...(JSON.parse(line.slice(7)) as Omit<ChromeCheck, 'harness'>) })
      } catch {
        fail('browser-harness ответил непонятно', true)
      }
    })
    child.stdin.end(readFileSync(file, 'utf8'))
  })
}
