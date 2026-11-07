import { useState } from 'react'
import { RefreshCw, SpellCheck } from 'lucide-react'
import { parsePronunciations, stressed, withPronunciation } from '@shared/speech'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'
import { Button, cx } from './ui'

const VOWELS = /[аеёиоуыэюяАЕЁИОУЫЭЮЯ]/

/**
 * Quick fix of a wrong stress: click the word, then its stressed vowel. The rule goes to the pronunciation
 * dictionary (Настройки › Общие › Произношение — every voice reads it, captions keep the spelling) and only this
 * clip's voice is recorded again. «Другой дубль» records it again as it is, for a take with other intonation.
 */
export function StressFix({ clipId, narration, busy }: { clipId: string; narration: string; busy: boolean }) {
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState<string | null>(null)
  const [rules, setRules] = useState<[string, string][]>([])
  const words = [...new Set(narration.replace(/<[^>]+>/g, ' ').match(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g) ?? [])].filter((w) => (w.match(new RegExp(VOWELS, 'g')) ?? []).length > 1)

  const toggle = async (): Promise<void> => {
    if (!open) setRules(parsePronunciations((await window.api.settings.get()).pronunciations ?? ''))
    setOpen(!open)
    setWord(null)
  }
  const revoice = async (newTake: boolean): Promise<void> => {
    try {
      await window.api.generate.clipTts(clipId, newTake)
      toast('info', 'Перезаписываем голос этого клипа…')
    } catch (e) {
      toast('error', errorText(e))
    }
  }
  const pick = async (w: string, at: number): Promise<void> => {
    const spoken = stressed(w, at)
    const s = await window.api.settings.get()
    const next = withPronunciation(s.pronunciations ?? '', w.toLowerCase(), spoken.toLowerCase())
    await window.api.settings.set({ pronunciations: next })
    setRules(parsePronunciations(next))
    setWord(null)
    toast('success', `Ударение: ${spoken}. Правило сохранено для всех роликов`)
    await revoice(true)
  }
  const ruleFor = (w: string): string | null => rules.find(([a]) => a.toLowerCase() === w.toLowerCase())?.[1] ?? null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<SpellCheck className="size-3.5" />} onClick={() => void toggle()} disabled={busy}>
          Ударение
        </Button>
        <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void revoice(true)} loading={busy} title="Записать этот клип ещё раз, с другой интонацией">
          Другой дубль
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-3 text-[13px]">
          {word ? (
            <>
              <span className="text-ink-2">Нажмите на ударную гласную:</span>
              <div className="flex flex-wrap gap-0.5 text-[22px] font-semibold">
                {[...word].map((ch, i) =>
                  VOWELS.test(ch) ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void pick(word, i)}
                      className="rounded-md px-1 text-accent-dark hover:bg-accent-soft"
                      title={`Ударение на «${ch}»`}
                    >
                      {ch}
                    </button>
                  ) : (
                    <span key={i} className="px-0.5 text-ink-2">
                      {ch}
                    </span>
                  )
                )}
              </div>
              <button type="button" onClick={() => setWord(null)} className="self-start text-xs text-muted hover:underline">
                ← другое слово
              </button>
            </>
          ) : (
            <>
              <span className="text-ink-2">Какое слово звучит неправильно?</span>
              <div className="flex flex-wrap gap-1.5">
                {words.map((w) => {
                  const r = ruleFor(w)
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWord(w)}
                      className={cx('rounded-full border px-2.5 py-0.5', r ? 'border-accent bg-accent-soft' : 'border-line-2 hover:border-ink-2')}
                      title={r ? `Уже есть правило: ${r}` : undefined}
                    >
                      {r ?? w}
                    </button>
                  )
                })}
              </div>
              <span className="text-xs text-muted">Правило сохранится в словаре произношения и будет работать во всех роликах; текст субтитров не меняется.</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
