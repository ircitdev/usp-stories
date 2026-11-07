import { useEffect, useState } from 'react'

const AUTHOR_URL = 'https://uspeshnyy.ru'

/** Settings › О приложении: version, credits and licences. */
export function AboutSection() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])
  const open = (url: string): void => void window.api.app.openExternal(url)

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-relaxed text-ink-2">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="font-display text-[34px] font-bold tracking-[-0.015em] text-ink">USP Stories</h1>
          <button
            type="button"
            onClick={() => open(AUTHOR_URL)}
            title="Открыть uspeshnyy.ru"
            className="self-start text-sm font-medium text-muted underline-offset-2 hover:text-accent-dark hover:underline"
          >
            by Aleksandr Uspeshnyy
          </button>
        </div>
        {version && <span className="rounded-full border border-line-2 px-3 py-1 font-mono text-xs text-ink">Версия {version}</span>}
      </div>

      <p>
        Превращает идею в готовое видео: сценарий, раскадровка, кадры и клипы, закадровый голос, субтитры и монтаж — в одном приложении. Персонажи
        сохраняют лицо и голос из сцены в сцену: их можно создать по фото или по видео с человеком, а говорящую голову — оживить по настоящему портрету.
      </p>
      <p>
        Работает на этом компьютере: сценарий и анализ видео — локальная модель в Ollama, кадры и видео — ComfyUI, голос — VoiceStudio, распознавание
        речи — Whisper. По желанию подключаются облачные сервисы: Google Flow, Higgsfield, Gemini и ElevenLabs. Все проекты, картинки, видео и звук
        хранятся на этом компьютере.
      </p>
      <p>
        Автор —{' '}
        <button type="button" onClick={() => open(AUTHOR_URL)} className="font-semibold text-accent-dark underline-offset-2 hover:underline">
          uspeshnyy.ru
        </button>
        : ИИ в маркетинге и производстве видео.
      </p>
      <p className="text-sm text-muted">
        В комплект входят FFmpeg (лицензия GPL) для рендера видео, whisper.cpp (лицензия MIT) для синхронизации субтитров с голосом и шрифты для
        субтитров из Google Fonts (SIL Open Font License и Apache 2.0). Модели распознавания речи скачиваются отдельно или берутся уже установленные.
        Тексты лицензий, в том числе лицензии исходного кода, лежат в папке приложения licenses.
      </p>
      <p className="text-sm text-muted">
        Логотипы Gemini, Google Flow, OpenRouter, Groq, ElevenLabs и Higgsfield — товарные знаки их владельцев, они нужны только чтобы показать, какой
        сервис подключён. Иконки сервисов взяты из LobeHub Icons (лицензия MIT).
      </p>
    </section>
  )
}
