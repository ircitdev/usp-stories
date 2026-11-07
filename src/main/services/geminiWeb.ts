import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { app } from 'electron'
import { dataDir } from '../paths'
import { getSettings } from '../settings'

/**
 * Music through gemini.google.com open in the user's Chrome (the «Музыка» mode of their Gemini subscription):
 * browser-harness runs resources/gemini/gemini_music.py, which sends the prompt, waits for the track and downloads it.
 */

function harness(): string {
  const own = getSettings().browserHarness?.trim()
  if (own) return own
  const local = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'browser-harness.exe' : 'browser-harness')
  return existsSync(local) ? local : 'browser-harness'
}

const script = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'gemini', 'gemini_music.py') : join(app.getAppPath(), 'resources', 'gemini', 'gemini_music.py')

export function makeMusic(prompt: string, signal: AbortSignal): Promise<{ bytes: Buffer; ext: string }> {
  const dir = join(dataDir(), 'tmp', 'gemini-music')
  mkdirSync(dir, { recursive: true })
  const stamp = `${Date.now()}`
  const promptFile = join(dir, `prompt-${stamp}.txt`)
  writeFileSync(promptFile, prompt, 'utf8')
  return new Promise((resolve, reject) => {
    const child = spawn(harness(), [], {
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', GEM_PROMPT: promptFile, GEM_OUT_DIR: dir, GEM_TIMEOUT: '420' }
    })
    const onAbort = (): void => void child.kill()
    signal.addEventListener('abort', onAbort, { once: true })
    let result: { ok: boolean; error?: string; file?: string } | null = null
    let buf = ''
    let errText = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (c: string) => {
      buf += c
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        const m = /^RESULT (.*)$/.exec(line)
        if (m) {
          try {
            result = JSON.parse(m[1])
          } catch {
            // not ours
          }
        }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (c: string) => (errText = (errText + c).slice(-4000)))
    child.on('error', (e) => reject(new Error(`Не удалось запустить browser-harness: ${e.message}`)))
    child.on('close', () => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) return reject(new Error('Отменено'))
      if (result?.ok && result.file && existsSync(result.file)) return resolve({ bytes: readFileSync(result.file), ext: extname(result.file) || '.mp3' })
      const last = errText.trim().split('\n').slice(-2).join(' ')
      reject(new Error(result?.error ?? (last ? `Gemini в Chrome: ${last}` : 'Gemini в Chrome не вернул музыку')))
    })
    child.stdin.end(readFileSync(script(), 'utf8'))
  })
}
