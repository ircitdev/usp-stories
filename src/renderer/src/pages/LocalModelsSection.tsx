import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Bot, Download, FolderOpen, Image as ImageIcon, Music, RefreshCw, UserRound, Video } from 'lucide-react'
import { MODEL_GROUPS, MODEL_PACKS, OLLAMA_SUGGESTED, gb, type ModelGroup } from '@shared/localModels'
import type { ModelInventory, ModelPackState, ModelProgress } from '@shared/types'
import { Badge, Button, Progress, cx, inputCls } from '../components/ui'
import { errorText } from '../lib/format'
import { useApp } from '../store/app'

const GROUP_ICON: Record<ModelGroup, ReactNode> = {
  image: <ImageIcon className="size-[18px]" />,
  video: <Video className="size-[18px]" />,
  talk: <UserRound className="size-[18px]" />,
  music: <Music className="size-[18px]" />
}

/**
 * What runs on this computer: each ComfyUI model pack the app uses (ready, missing files or nodes, downloading),
 * Ollama's language models, VoiceStudio and Whisper. Missing files of known packs download from here.
 */
export function LocalModelsSection({ connection, footer }: { connection?: ReactNode; footer?: ReactNode }) {
  const { toast } = useApp()
  const [inv, setInv] = useState<ModelInventory | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const [custom, setCustom] = useState('')

  const check = useCallback(async (fresh = true): Promise<void> => {
    setChecking(true)
    try {
      setInv(await window.api.localModels.inventory(fresh))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check(true)
    void window.api.localModels.downloads().then((list) => setProgress(Object.fromEntries(list.map((p) => [p.id, p]))))
    return window.api.on.models((p) => {
      setProgress((all) => {
        const next = { ...all }
        if (p.finished) delete next[p.id]
        else next[p.id] = p
        return next
      })
      if (p.finished) {
        if (p.error) toast('error', p.error)
        else toast('success', p.id.startsWith('ollama:') ? `Модель ${p.id.slice(7)} скачана` : `${MODEL_PACKS.find((d) => d.id === p.id)?.name ?? 'Модель'} установлена`)
        void check(true)
      }
    })
  }, [check, toast])

  // A download started outside the app shows its growth: check the files again every few seconds.
  const external = !!inv?.packs.some((p) => p.state === 'downloading' && !progress[p.id])
  useEffect(() => {
    if (!external) return
    const t = setInterval(() => void check(true), 5000)
    return () => clearInterval(t)
  }, [external, check])

  const install = (id: string): void => {
    void window.api.localModels.install(id).catch((e) => toast('error', errorText(e)))
    setProgress((all) => ({ ...all, [id]: { id, file: null, done: 0, total: 0 } }))
  }
  const pull = (name: string): void => {
    if (!name.trim()) return
    void window.api.localModels.pullOllama(name.trim()).catch((e) => toast('error', errorText(e)))
    setProgress((all) => ({ ...all, [`ollama:${name.trim()}`]: { id: `ollama:${name.trim()}`, file: name, done: 0, total: 0 } }))
  }

  const ready = inv?.packs.filter((p) => p.state === 'ready').length ?? 0

  return (
    <>
      <div>
        <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Локальные модели</h1>
        <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
          Что стоит на этом компьютере для кадров, видео, музыки, голоса и сценария. Недостающее можно скачать отсюда: файлы лягут прямо в папки ComfyUI и Ollama,
          прерванная загрузка продолжится с того же места.
        </p>
      </div>

      {connection}

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-base font-bold">Модели ComfyUI</span>
            {inv ? (
              inv.comfy ? (
                <>
                  <Badge tone={ready === inv.packs.length ? 'ok' : 'info'}>
                    Готово {ready} из {inv.packs.length}
                  </Badge>
                  <span className="text-xs text-ink-2">
                    рекомендуемые: {MODEL_PACKS.filter((d) => d.recommended && inv.packs.find((p) => p.id === d.id)?.state === 'ready').length} из{' '}
                    {MODEL_PACKS.filter((d) => d.recommended).length}
                  </span>
                </>
              ) : (
                <Badge tone="bad">ComfyUI не отвечает</Badge>
              )
            ) : (
              <Badge>Проверяем…</Badge>
            )}
          </span>
          <Button size="sm" icon={<FolderOpen className="size-4" />} disabled={!inv?.comfy} onClick={() => void window.api.localModels.openFolder().catch((e) => toast('error', errorText(e)))}>
            Папка моделей
          </Button>
          <Button size="sm" icon={<RefreshCw className={cx('size-4', checking && 'animate-spin')} />} onClick={() => void check(true)}>
            Проверить снова
          </Button>
        </div>
        {inv && !inv.comfy && (
          <p className="text-[13px] text-bad-ink">Запустите ComfyUI (ярлык «ComfyUI (картинки и видео)») — без него не проверить и не скачать модели для кадров, видео и музыки.</p>
        )}
        {inv?.comfy &&
          MODEL_GROUPS.map((g) => (
            <div key={g.id} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                {GROUP_ICON[g.id]}
                {g.label}
              </span>
              {MODEL_PACKS.filter((d) => d.group === g.id)
                .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
                .map((d) => {
                  const st = inv.packs.find((p) => p.id === d.id)
                  return st ? (
                    <PackRow key={d.id} name={d.name} use={d.use} pros={d.pros} howTo={d.howTo} recommended={d.recommended} st={st} progress={progress[d.id]} onInstall={() => install(d.id)} onCancel={() => void window.api.localModels.cancel(d.id)} />
                  ) : null
                })}
            </div>
          ))}
      </section>

      {inv && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-[18px]">
          <span className="flex items-center gap-2 text-base font-bold">
            <Bot className="size-[18px]" />
            Ollama — сценарий и разбор видео
            {inv.ollama.up ? <Badge tone="ok">Работает</Badge> : <Badge tone="bad">Не отвечает</Badge>}
          </span>
          {inv.ollama.up ? (
            <>
              <div className="flex flex-col gap-1.5">
                {inv.ollama.models.map((m) => (
                  <div key={m.name} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13px]">
                    <span className="flex-1 font-mono">{m.name}</span>
                    <span className="text-muted">{gb(m.bytes)}</span>
                    {m.name === inv.ollama.current || m.name === `${inv.ollama.current}:latest` ? <Badge tone="ok">Используется</Badge> : <Badge>Установлена</Badge>}
                  </div>
                ))}
              </div>
              {OLLAMA_SUGGESTED.filter((s) => !inv.ollama.models.some((m) => m.name === s.name)).map((s) => (
                <OllamaPull key={s.name} name={s.name} note={s.note} progress={progress[`ollama:${s.name}`]} onPull={() => pull(s.name)} />
              ))}
              {Object.values(progress)
                .filter((p) => p.id.startsWith('ollama:') && !OLLAMA_SUGGESTED.some((s) => `ollama:${s.name}` === p.id))
                .map((p) => (
                  <OllamaPull key={p.id} name={p.id.slice(7)} note="" progress={p} onPull={() => undefined} />
                ))}
              <div className="flex items-center gap-2 border-t border-dashed border-line pt-3">
                <input
                  className={cx(inputCls, 'flex-1 font-mono')}
                  placeholder="Другая модель, например qwen3:14b"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (pull(custom), setCustom(''))}
                  spellCheck={false}
                />
                <Button icon={<Download className="size-4" />} disabled={!custom.trim()} onClick={() => (pull(custom), setCustom(''))}>
                  Скачать
                </Button>
              </div>
              <p className="text-xs text-muted">Модель для сценария выбирается в «ИИ-сервисы и ключи › Автор сценария» (свой endpoint). Сейчас: {inv.ollama.current}.</p>
            </>
          ) : (
            <p className="text-[13px] text-ink-2">Ollama не запущен. Установите его с ollama.com и откройте эту страницу снова — модели можно будет скачать отсюда.</p>
          )}
        </section>
      )}

      {footer}
    </>
  )
}

/** «Чем хороша» and «Когда брать» of a model. */
function About({ pros, howTo }: { pros: string; howTo: string }) {
  return (
    <span className="flex flex-col gap-0.5 text-xs leading-relaxed">
      <span>
        <span className="font-semibold text-ink">Чем хороша: </span>
        <span className="text-ink-2">{pros}</span>
      </span>
      <span>
        <span className="font-semibold text-ink">Когда брать: </span>
        <span className="text-ink-2">{howTo}</span>
      </span>
    </span>
  )
}

function PackRow({ name, use, pros, howTo, recommended, st, progress, onInstall, onCancel }: { name: string; use: string; pros: string; howTo: string; recommended?: string; st: ModelPackState; progress?: ModelProgress; onInstall: () => void; onCancel: () => void }) {
  const missing = st.files.filter((f) => !f.present)
  // Files downloaded by someone else (or before a restart) count by their «.part» size.
  const partDone = missing.reduce((n, f) => n + (f.partBytes ?? 0), 0)
  const partTotal = missing.reduce((n, f) => n + (f.bytes ?? 0), 0)
  const busy = !!progress || st.state === 'downloading'
  const done = progress ? progress.done : partDone
  const total = progress?.total || partTotal
  if (st.state === 'ready' && !busy)
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px]">
        <div className="flex items-center gap-3">
          <span className="shrink-0 font-semibold">{name}</span>
          {recommended && <RecBadge why={recommended} />}
          <span className="min-w-0 flex-1 truncate text-ink-2">{use}</span>
          <Badge tone="ok">Установлено</Badge>
        </div>
        <About pros={pros} howTo={howTo} />
      </div>
    )
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-2 bg-paper px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {name}
            {recommended && <RecBadge why={recommended} />}
          </span>
          <span className="text-[13px] text-ink-2">{use}</span>
          <span className="mt-1">
            <About pros={pros} howTo={howTo} />
          </span>
          {recommended && <span className="mt-0.5 text-xs text-accent-dark">Рекомендуем: {recommended}</span>}
        </div>
        {busy ? (
          <Badge tone="warn">Скачивается</Badge>
        ) : st.state === 'ready' ? (
          <Badge tone="ok">Установлено</Badge>
        ) : st.noWorkflow ? (
          <Badge tone="bad">Нет схемы</Badge>
        ) : st.missingNodes.length ? (
          <Badge tone="bad">Нужны узлы</Badge>
        ) : (
          <Badge tone="draft">Не установлено</Badge>
        )}
      </div>
      {st.state !== 'ready' && !busy && (
        <div className="flex flex-col gap-1 text-[12px] text-ink-2">
          {st.noWorkflow && <span>Нет файла схемы ComfyUI — проверьте папку схем в «ИИ-сервисы и ключи › Локальные модели».</span>}
          {st.missingNodes.length > 0 && <span>В ComfyUI нет узлов: {st.missingNodes.join(', ')}. Обновите ComfyUI или поставьте пакет узлов.</span>}
          {missing.map((f) => (
            <span key={f.name} className="font-mono">
              нет {f.name}
              {f.bytes ? ` · ${gb(f.bytes)}` : ''}
              {f.partBytes ? ` · скачано ${gb(f.partBytes)}` : ''}
            </span>
          ))}
          {missing.some((f) => !f.downloadable) && <span>Эти файлы приложение не скачивает: их ставят в ComfyUI вручную (Менеджер моделей ComfyUI).</span>}
          {st.error && <span className="rounded-md bg-bad-soft px-2 py-1 text-bad-ink">{st.error}</span>}
        </div>
      )}
      {busy && (
        <div className="flex flex-col gap-1.5">
          <Progress value={total ? done / total : 0} />
          <span className="font-mono text-xs text-ink-2">
            {gb(done)} из {gb(total)}
            {progress?.file ? ` · ${progress.file}` : progress ? '' : ' · качается другой программой'}
          </span>
        </div>
      )}
      {(st.canInstall || progress) && (
        <div className="flex gap-2">
          {progress ? (
            <Button size="sm" onClick={onCancel}>
              Остановить
            </Button>
          ) : (
            !busy && (
              <Button size="sm" variant="accent" icon={<Download className="size-4" />} onClick={onInstall}>
                {partDone > 0 ? `Продолжить (осталось ${gb(st.toDownload)})` : `Скачать и установить · ${gb(st.toDownload)}`}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/** «Рекомендуем» with the reason on hover. */
function RecBadge({ why }: { why: string }) {
  return (
    <span title={why} className="shrink-0 rounded-full bg-accent-soft px-2 py-[2px] text-[11px] font-semibold text-accent-dark">
      Рекомендуем
    </span>
  )
}

function OllamaPull({ name, note, progress, onPull }: { name: string; note: string; progress?: ModelProgress; onPull: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-2 bg-paper px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-sm font-semibold">{name}</span>
          {note && <span className="text-[13px] text-ink-2">{note}</span>}
        </div>
        {progress ? (
          <Button size="sm" onClick={() => void window.api.localModels.cancel(progress.id)}>
            Остановить
          </Button>
        ) : (
          <Button size="sm" variant="accent" icon={<Download className="size-4" />} onClick={onPull}>
            Скачать
          </Button>
        )}
      </div>
      {progress && (
        <div className="flex flex-col gap-1.5">
          <Progress value={progress.total ? progress.done / progress.total : 0} />
          <span className="font-mono text-xs text-ink-2">
            {progress.total ? `${gb(progress.done)} из ${gb(progress.total)}` : 'Готовимся…'}
            {progress.file && progress.file !== name ? ` · ${progress.file}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
