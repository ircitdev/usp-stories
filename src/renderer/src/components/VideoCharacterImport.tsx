import { useState } from 'react'
import { Film } from 'lucide-react'
import type { CardMode, CharacterFromVideo } from '@shared/types'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'
import { Button, Spinner } from './ui'

/**
 * «Создать из видео»: a real video of the person is analysed on this computer and fills the character —
 * appearance, manner, head/gaze/face, portrait, a photo card of real frames and, if asked, a cloned voice.
 */
export function VideoCharacterImport({ name, onResult }: { name: string; onResult: (r: CharacterFromVideo, opts: { card: boolean }) => void }) {
  const { toast } = useApp()
  const [file, setFile] = useState<string | null>(null)
  const [cloneVoice, setCloneVoice] = useState(true)
  const [card, setCard] = useState(true)
  const [cardMode, setCardMode] = useState<CardMode>('local')
  const [busy, setBusy] = useState(false)

  const pick = async (): Promise<void> => {
    const r = await window.api.library.pickFile('video')
    if (r) setFile(r.path)
  }
  const run = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    try {
      const r = await window.api.library.fromVideo(file, { name, cloneVoice, card: card ? cardMode : 'frames' })
      onResult(r, { card })
      toast(r.voiceNote || r.cardNote ? 'info' : 'success', [r.voiceNote, r.cardNote].filter(Boolean).join(' ') || 'Поля заполнены по видео — проверьте и поправьте, если нужно')
      setFile(null)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-paper p-3.5">
      <div className="flex items-center gap-3">
        <Film className="size-5 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">Создать из видео</span>
          <span className="text-[13px] text-ink-2">
            Загрузите настоящее видео с человеком: внешность, манера, мимика и портрет заполнятся сами. Анализ идёт на этом компьютере.
          </span>
        </div>
        <Button size="sm" onClick={() => void pick()} disabled={busy}>
          {file ? 'Другое видео' : 'Выбрать видео'}
        </Button>
      </div>
      {file && (
        <>
          <span className="truncate text-[13px] text-ink-2">{file.split(/[\\/]/).pop()}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={cloneVoice} onChange={(e) => setCloneVoice(e.target.checked)} />
              Клонировать голос
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} />
              Создать карту персонажа
            </label>
            {card && (
              <select
                value={cardMode}
                onChange={(e) => setCardMode(e.target.value as CardMode)}
                aria-label="Чем делать карту персонажа"
                className="h-8 rounded-lg border border-line-2 bg-surface px-2 text-[13px]"
              >
                <option value="local">Локально: Qwen-Image 2.1 — студийный портрет и лист</option>
                <option value="frames">Кадры из видео, без генерации</option>
              </select>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="accent" loading={busy} onClick={() => void run()}>
              Проанализировать
            </Button>
          </div>
          {busy && (
            <span className="flex items-center gap-2 text-[13px] text-sun-ink">
              <Spinner className="size-3.5" /> Смотрим видео: кадры, манера, мимика{cloneVoice ? ', голос' : ''}
              {card && cardMode === 'local' ? ', рисуем портрет и лист' : ''}… обычно 2–4 минуты
            </span>
          )}
          <span className="text-[12px] text-muted">
            Карта персонажа: локально Qwen-Image 2.1 рисует по лучшему кадру студийный портрет и лист ракурсов, эмоций и деталей — без надписей из видео; «Кадры из видео» — четыре настоящих кадра. Голос и внешность реального человека — только с его согласия.
          </span>
        </>
      )}
    </div>
  )
}
