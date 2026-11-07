import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { app } from 'electron'
import { dataDir } from '../paths'
import { getSettings } from '../settings'

/**
 * Pictures from ChatGPT open in the user's Chrome (resources/chatgpt/chatgpt_image.py through browser-harness):
 * a chat of its own in a tab of its own, character cards attached, the picture taken from the page; the chat is hidden
 * from the user's history afterwards. Uses the user's ChatGPT plan and its picture limits.
 */

function harness(): string {
  const own = getSettings().browserHarness?.trim()
  if (own) return own
  const local = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'browser-harness.exe' : 'browser-harness')
  return existsSync(local) ? local : 'browser-harness'
}

function script(): string {
  return app.isPackaged ? join(process.resourcesPath, 'chatgpt', 'chatgpt_image.py') : join(app.getAppPath(), 'resources', 'chatgpt', 'chatgpt_image.py')
}

export function makeImage(
  prompt: string,
  files: string[],
  signal: AbortSignal,
  onProgress: (message: string) => void
): Promise<{ bytes: Buffer; ext: string; note: string | null }> {
  const dir = join(dataDir(), 'tmp', 'chatgpt')
  mkdirSync(dir, { recursive: true })
  const stamp = `${Date.now()}`
  const promptFile = join(dir, `prompt-${stamp}.txt`)
  const out = join(dir, `image-${stamp}.png`)
  writeFileSync(promptFile, prompt, 'utf8')
  return new Promise((resolve, reject) => {
    const child = spawn(harness(), [], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', GPT_PROMPT: promptFile, GPT_OUT: out, GPT_FILES: JSON.stringify(files), GPT_TIMEOUT: '480' }
    })
    const onAbort = (): void => void child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    let result: { ok: boolean; error?: string; file?: string; note?: string | null } | null = null
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
    child.on('error', (e) => reject(new Error(`Не удалось запустить browser-harness (${harness()}): ${e.message}. Проверьте «Настройки › ИИ-сервисы и ключи › Google в Chrome».`)))
    child.on('close', () => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return reject(new Error('Отменено'))
      const file = result?.file && existsSync(result.file) ? result.file : out
      if (result?.ok && existsSync(file)) return resolve({ bytes: readFileSync(file), ext: extname(file).toLowerCase() || '.png', note: result.note ?? null })
      const last = errText.trim().split('\n').slice(-2).join(' ')
      reject(new Error(result?.error ?? (last ? `ChatGPT: ${last}` : 'ChatGPT не вернул картинку')))
    })
    child.stdin.end(readFileSync(script(), 'utf8'))
  })
}
