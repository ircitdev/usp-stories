import { useEffect, useState } from 'react'
import { AudioLines, Captions, Download, FolderOpen, Trash2 } from 'lucide-react'
import type { AppSettings, WhisperStatus } from '@shared/types'
import { Badge, Button, Progress, Switch, confirmDialog } from '../components/ui'

const mb = (n: number): string => `${Math.round(n / 1_000_000).toLocaleString('ru-RU')} MB`

/** Settings for the local Whisper Small model that times caption words against the real voice. */
export function WhisperSection({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const [status, setStatus] = useState<WhisperStatus | null>(null)

  useEffect(() => {
    void window.api.whisper.status().then(setStatus)
    return window.api.on.whisper(setStatus)
  }, [])

  if (!status) return null
  const busy = status.state === 'downloading' || status.state === 'verifying'

  const remove = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Удалить модель Whisper?',
      body: `Файл модели (${mb(status.total)}) будет удалён с этого компьютера. Уже синхронизированные субтитры останутся, а модель можно скачать снова в любой момент.`,
      confirm: 'Удалить модель',
      danger: true
    })
    if (ok) await window.api.whisper.remove()
  }

  return (
    <>
      <div className="mt-5 flex items-start gap-3">
        <span className="mt-1 text-ink">
          <Captions className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[22px] font-bold leading-tight">Точные субтитры</h2>
          <p className="text-sm text-ink-2">Подгоняет время каждого слова в субтитрах под закадровый голос — прямо на этом компьютере.</p>
        </div>
      </div>
      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-ink bg-ink text-paper">
            <AudioLines className="size-5" />
          </span>
          <div className="flex flex-1 flex-col">
            <span className="text-base font-bold">Whisper Small</span>
            <span className="text-[13px] text-ink-2">Многоязычное распознавание речи (включая русский) через whisper.cpp · {mb(status.total)}</span>
          </div>
          {status.state === 'ready' ? (
            <Badge tone="ok">Готово к работе</Badge>
          ) : !busy && status.engine === 'faster-whisper' ? (
            <Badge tone="info">Не скачана — есть замена</Badge>
          ) : busy ? (
            <Badge tone="warn">{status.state === 'verifying' ? 'Проверка файла' : 'Скачивание'}</Badge>
          ) : (
            <Badge tone="draft">Не скачана</Badge>
          )}
        </div>

        <p className="text-[13px] leading-relaxed text-ink-2">
          Нужна для голоса Gemini TTS: он не передаёт время каждого слова. ElevenLabs присылает точные тайминги сам. После скачивания
          Whisper работает без интернета и бесплатно.
        </p>

        {status.local && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-paper px-3.5 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">Установлено на компьютере: {status.local.name}</span>
              <span className="truncate text-[12px] text-muted">{status.local.path}</span>
              <span className="text-[13px] text-ink-2">
                {status.engine === 'faster-whisper'
                  ? 'Используется для субтитров и клонирования голоса — скачивать Whisper Small не нужно.'
                  : 'Найдено, но сейчас используется скачанный Whisper Small.'}
              </span>
            </div>
            {status.engine === 'faster-whisper' && <Badge tone="ok">Используется</Badge>}
          </div>
        )}

        {busy && (
          <div className="flex flex-col gap-1.5">
            <Progress value={status.total ? status.received / status.total : 0} />
            <span className="font-mono text-xs text-ink-2">
              {mb(status.received)} из {mb(status.total)}
              {status.state === 'verifying' ? ' · проверяем целостность файла…' : ''}
            </span>
          </div>
        )}
        {status.error && !busy && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad-ink">{status.error}</p>}

        <div className="flex flex-wrap gap-2">
          {status.state === 'ready' ? (
            <>
              <Button icon={<FolderOpen className="size-4" />} onClick={() => void window.api.whisper.openFolder()}>
                Открыть папку
              </Button>
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
                Удалить модель
              </Button>
            </>
          ) : busy ? (
            <Button disabled={status.state === 'verifying'} onClick={() => void window.api.whisper.cancel()}>
              Отмена
            </Button>
          ) : (
            <Button variant="accent" icon={<Download className="size-4" />} onClick={() => void window.api.whisper.download()}>
              {status.received > 0
                ? `Продолжить скачивание (осталось ${mb(status.total - status.received)})`
                : `Скачать модель (${mb(status.total)})${status.local ? ' — необязательно' : ''}`}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-dashed border-line pt-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">Синхронизировать автоматически</p>
            <p className="text-[13px] text-muted">Каждый раз, когда Gemini записывает закадровый голос, субтитры сразу подгоняются под него.</p>
          </div>
          <Switch on={settings.whisperAuto} onChange={async (v) => onSettings(await window.api.settings.set({ whisperAuto: v }))} label="Синхронизировать субтитры автоматически" />
        </div>
      </section>
    </>
  )
}
