import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  HardDriveDownload,
  Image as ImageIcon,
  Info,
  KeyRound,
  Mic,
  Captions,
  Globe,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Wallet,
  X
} from 'lucide-react'
import { HF_IMAGE_MODELS, HF_VIDEO_MODELS } from '@shared/higgsfield'
import { LANGUAGES, LLM_PROVIDERS } from '@shared/models'
import type { ApiProvider, AppSettings, ChromeCheck, KeyStatus, KeyTestResult, LlmProvider, LocalStatus, TtsProvider } from '@shared/types'
import { CaptionPreview, CaptionSettings, type CaptionLook } from '../components/CaptionSettings'
import { Logo } from '../components/Logo'
import { ModelPicker } from '../components/ModelPicker'
import { ProviderLogo, type ProviderLogoId } from '../components/ProviderLogo'
import { Select } from '../components/Select'
import { AboutSection } from './AboutSection'
import { LibrarySection } from './LibrarySection'
import { LocalModelsSection } from './LocalModelsSection'
import { UsageView } from '../components/UsageView'
import { WhisperSection } from './WhisperSection'
import { Badge, Button, Field, IconButton, Segmented, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText, relativeTime } from '../lib/format'
import { useModels } from '../lib/useModels'
import { useApp } from '../store/app'

type Tab = 'services' | 'models' | 'usage' | 'characters' | 'captions' | 'general' | 'about'

interface ProviderOption<T extends string> {
  id: T
  name: string
  note: string
  logo: ProviderLogoId
  status?: KeyStatus
  /** A badge of its own, for services without a key (VoiceStudio: whether it answers). */
  badge?: ReactNode
}

function StatusBadge({ status }: { status?: KeyStatus }) {
  if (!status?.configured) return <Badge tone="draft">Не настроен</Badge>
  if (status.lastOk === false) return <Badge tone="bad">Нет подключения</Badge>
  if (status.lastOk)
    return (
      <Badge tone="ok">
        <Check className="size-3" strokeWidth={3} />
        Подключён
      </Badge>
    )
  return <Badge tone="info">Сохранён</Badge>
}

/** One dropdown to choose which provider a section uses; only that provider's settings are shown below it. */
function ProviderSelect<T extends string>({ value, options, onChange }: { value: T; options: ProviderOption<T>[]; onChange: (id: T) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const cur = options.find((o) => o.id === value) ?? options[0]
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-surface px-4 py-3 text-left transition-shadow',
          open ? 'shadow-none' : 'shadow-ink hover:shadow-ink-md'
        )}
      >
        <ProviderLogo id={cur.logo} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-bold">{cur.name}</span>
          <span className="truncate text-[13px] text-ink-2">{cur.note}</span>
        </span>
        {cur.badge ?? <StatusBadge status={cur.status} />}
        <ChevronDown className={cx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-40 mt-1.5 flex flex-col gap-0.5 rounded-2xl border-[1.5px] border-ink bg-surface p-1.5 shadow-ink-lg">
          {options.map((o) => {
            const on = o.id === value
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setOpen(false)
                  if (!on) onChange(o.id)
                }}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', on ? 'bg-accent-soft' : 'hover:bg-sand')}
              >
                <ProviderLogo id={o.logo} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="truncate text-[13px] text-ink-2">{o.note}</span>
                </span>
                {o.badge ?? <StatusBadge status={o.status} />}
                <span className="flex size-5 shrink-0 items-center justify-center">{on && <Check className="size-4 text-accent" strokeWidth={2.6} />}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** API key field(s) with save, test and delete. The custom endpoint also takes a base URL. */
function KeyForm({
  provider,
  name,
  status,
  label = 'API-ключ',
  placeholder = 'Вставьте API-ключ',
  hint,
  help,
  link,
  linkLabel,
  customUrl,
  onChanged,
  onSaved
}: {
  provider: ApiProvider
  name: string
  status?: KeyStatus
  label?: string
  placeholder?: string
  hint?: ReactNode
  help: string
  link: string | null
  linkLabel: string
  customUrl?: string
  onChanged: () => void
  onSaved?: (r: KeyTestResult) => void
}) {
  const { toast } = useApp()
  const configured = !!status?.configured
  const isCustom = provider === 'custom'
  const preview = status?.preview ?? null
  const [editing, setEditing] = useState(!preview)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(customUrl ?? '')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showTyped, setShowTyped] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  // A newly saved or removed key puts the field back in its resting state.
  useEffect(() => {
    setEditing(!preview)
    setKey('')
    setRevealed(null)
  }, [preview])

  // The stored key is shown masked; the custom endpoint keeps an editable (optional) key field.
  const showStored = !isCustom && !editing && !!preview
  const urlChanged = isCustom && url.trim() !== (customUrl ?? '').trim()
  const canSave = isCustom ? !!url.trim() && (urlChanged || !!key.trim() || !configured) : !showStored && !!key.trim()
  // A pasted key only counts once it is saved; Enter saves it too.
  const unsaved = !isCustom && !showStored && !!key.trim() && busy !== 'save'
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !canSave || busy) return
    e.preventDefault()
    void save()
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      const r = isCustom ? await window.api.settings.setCustom(url, key) : await window.api.settings.setKey(provider, key)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      setKey('')
      setEditing(false)
      onChanged()
      onSaved?.(r)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleEye = async (): Promise<void> => {
    if (!showStored) {
      setShowTyped(!showTyped)
      return
    }
    setRevealed(revealed ? null : await window.api.settings.revealKey(provider))
  }
  const visible = showStored ? !!revealed : showTyped

  const test = async (): Promise<void> => {
    setBusy('test')
    try {
      const r = await window.api.settings.testKey(provider)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const clear = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Удалить ${isCustom ? 'endpoint' : 'ключ'} ${name}?`,
      body: 'Данные будут удалены с этого компьютера. Добавить их снова можно в любой момент.',
      confirm: 'Удалить',
      danger: true
    })
    if (!ok) return
    await window.api.settings.clearKey(provider)
    setUrl('')
    onChanged()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        {isCustom && (
          <Field label="Адрес endpoint (base URL)" className="flex-[1.3]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter}
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              className={cx(inputCls, 'h-11 font-mono text-sm')}
            />
          </Field>
        )}
        <Field label={isCustom ? 'API-ключ (необязательно)' : label} className="flex-1">
          <div className="relative">
            {showStored ? (
              <input
                readOnly
                value={revealed ?? preview ?? ''}
                aria-label={`${label} сохранён`}
                className={cx(inputCls, 'h-11 cursor-default bg-paper pr-11 font-mono text-sm')}
              />
            ) : (
              <input
                type={showTyped ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoFocus={!isCustom && !!preview}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={onEnter}
                placeholder={
                  isCustom ? (preview ? `Сохранён (${preview}) · введите новый, чтобы заменить` : 'Оставьте пустым для локального сервера') : placeholder
                }
                className={cx(inputCls, 'h-11 pr-11')}
              />
            )}
            {(showStored || key.length > 0) && (
              <button
                type="button"
                aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
                title={visible ? 'Скрыть ключ' : 'Показать ключ'}
                onClick={() => void toggleEye()}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
              >
                {visible ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
              </button>
            )}
          </div>
        </Field>
        {showStored ? (
          <Button
            className="h-11"
            onClick={() => {
              setEditing(true)
              setRevealed(null)
            }}
          >
            Заменить
          </Button>
        ) : (
          <Button variant="accent" className="h-11" disabled={!canSave} loading={busy === 'save'} onClick={() => void save()}>
            Сохранить и проверить
          </Button>
        )}
        {!isCustom && editing && !!preview && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => {
              setEditing(false)
              setKey('')
            }}
          >
            Отмена
          </Button>
        )}
        {configured && (
          <>
            <Button className="h-11" loading={busy === 'test'} onClick={() => void test()}>
              Проверить
            </Button>
            <IconButton label={`Удалить ${name}`} size={44} className="text-bad-ink" onClick={() => void clear()}>
              <Trash2 className="size-[18px]" />
            </IconButton>
          </>
        )}
      </div>
      {unsaved && <p className="-mt-1 text-[13px] font-semibold text-accent-dark">Ключ ещё не сохранён. Нажмите Enter или «Сохранить и проверить».</p>}
      {hint && <p className="-mt-1 text-[13px] text-ink-2">{hint}</p>}
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className={cx('flex-1', configured && status?.lastOk === false && 'text-bad-ink')}>
          {configured && status?.lastMessage
            ? `${status.lastMessage}${status.checkedAt && !status.unreadable ? ` · проверено ${relativeTime(status.checkedAt)}` : ''}`
            : help}
        </span>
        {link && (
          <button
            type="button"
            onClick={() => void window.api.app.openExternal(link)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent-dark hover:underline"
          >
            {linkLabel}
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">{children}</section>
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub: ReactNode }) {
  return (
    <div className="mt-5 flex items-start gap-3">
      <span className="mt-1 text-ink">{icon}</span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-bold leading-tight">{title}</h2>
        <p className="text-sm text-ink-2">{sub}</p>
      </div>
    </div>
  )
}

function LlmSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const { toast } = useApp()
  const provider = settings.llmProvider
  const spec = LLM_PROVIDERS.find((p) => p.id === provider)!
  const status = statusOf(provider)
  const configured = !!status?.configured
  const [openPicker, setOpenPicker] = useState(false)
  const models = useModels(provider, configured && status?.lastOk !== false, provider === 'custom' ? settings.customBaseUrl : '')
  const model = settings.llmModels[provider]
  const selected = models.models.find((m) => m.id === model)

  const options: ProviderOption<LlmProvider>[] = LLM_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note,
    logo: p.id,
    status: statusOf(p.id)
  }))

  return (
    <>
      <SectionTitle
        icon={<Cpu className="size-5" />}
        title="Автор сценария (ИИ-модель)"
        sub="Выберите одного провайдера: он соберёт клипы, сценарий и персонажей. Используется только выбранный."
      />
      <ProviderSelect
        value={provider}
        options={options}
        onChange={async (id) => {
          setOpenPicker(false)
          onSettings(await window.api.settings.set({ llmProvider: id }))
        }}
      />
      <Card key={provider}>
        <KeyForm
          provider={provider}
          name={spec.name}
          status={status}
          help={provider === 'custom' ? 'Например: http://localhost:11434/v1 для Ollama, http://localhost:1234/v1 для LM Studio, https://api.x.ai/v1 для Grok.' : 'После сохранения ключа список моделей загрузится прямо у провайдера.'}
          hint={provider === 'gemini' && settings.defaultTtsProvider === 'gemini' ? 'Этот же ключ используется для голоса рассказчика Gemini TTS.' : undefined}
          link={spec.link}
          linkLabel={spec.linkLabel}
          customUrl={settings.customBaseUrl}
          onChanged={onChanged}
          onSaved={async (r) => {
            if (!r.ok) return
            onSettings(await window.api.settings.get())
            if (configured) void models.refresh()
            if (!model) setOpenPicker(true)
          }}
        />
        {configured && status?.lastOk !== false && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="text-sm font-semibold">Модель для сценария</span>
            <ModelPicker
              value={model}
              models={models.models}
              loading={models.loading}
              error={models.error}
              fetchedAt={models.fetchedAt}
              onChange={async (id) => {
                setOpenPicker(false)
                onSettings(await window.api.settings.set({ llmModels: { ...settings.llmModels, [provider]: id } }))
                toast('success', `Сценарий будет писать ${spec.name} · ${id}`)
              }}
              onRefresh={() => void models.refresh()}
              allowCustom={provider === 'custom'}
              defaultOpen={openPicker}
              placeholder="Выберите модель из списка"
            />
            {selected?.description && <p className="line-clamp-2 text-[13px] text-muted">{selected.description}</p>}
            {selected && provider === 'openrouter' && !selected.tags.includes('JSON') && (
              <p className="text-[13px] text-sun-ink">
                Эта модель не поддерживает структурированный вывод JSON. Приложение всё равно попробует, но модели с меткой JSON обычно работают стабильнее.
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

/** Badge for a local service: it has no key, only an address that answers or not. */
function UpBadge({ up }: { up: boolean | null }) {
  if (up == null) return <Badge tone="info">Проверяем…</Badge>
  if (!up) return <Badge tone="bad">Не отвечает</Badge>
  return (
    <Badge tone="ok">
      <Check className="size-3" strokeWidth={3} />
      Работает
    </Badge>
  )
}

type AddressKey = 'comfyUrl' | 'comfyWorkflowsDir' | 'voiceStudioUrl' | 'flowProjectUrl' | 'browserHarness'

/** Address fields edited locally and saved when a field loses focus; `up` puts a «Работает» badge next to a label. */
function AddressFields({
  settings,
  onSettings,
  fields,
  onSaved
}: {
  settings: AppSettings
  onSettings: (s: AppSettings) => void
  fields: { key: AddressKey; label: string; help: string; up?: boolean | null }[]
  onSaved?: () => void
}) {
  const [draft, setDraft] = useState<Record<AddressKey, string>>({
    comfyUrl: settings.comfyUrl,
    comfyWorkflowsDir: settings.comfyWorkflowsDir,
    voiceStudioUrl: settings.voiceStudioUrl,
    flowProjectUrl: settings.flowProjectUrl ?? '',
    browserHarness: settings.browserHarness ?? ''
  })
  const save = async (key: AddressKey): Promise<void> => {
    if ((settings[key] ?? '') === draft[key]) return
    onSettings(await window.api.settings.set({ [key]: draft[key] }))
    onSaved?.()
  }
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{f.label}</span>
            {f.up !== undefined && <UpBadge up={f.up} />}
          </div>
          <input className={inputCls} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur={() => void save(f.key)} spellCheck={false} />
          <span className="text-[13px] text-ink-2">{f.help}</span>
        </div>
      ))}
    </>
  )
}

/** Where the local services answer: ComfyUI (pictures, video, music) and VoiceStudio (voices). Top of «Локальные модели». */
export function LocalConnection({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const [status, setStatus] = useState<LocalStatus | null>(null)
  const check = (): void => {
    setStatus(null)
    void window.api.settings
      .localStatus()
      .then(setStatus)
      .catch(() => setStatus({ comfy: false, voiceStudio: false, llm: false }))
  }
  useEffect(check, [])
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">
      <span className="flex items-center gap-2 text-base font-bold">
        <Cpu className="size-[18px]" />
        Подключение
      </span>
      <AddressFields
        settings={settings}
        onSettings={onSettings}
        onSaved={check}
        fields={[
          { key: 'comfyUrl', label: 'ComfyUI — кадры, видео и музыка', help: 'Запуск — ярлык «ComfyUI (картинки и видео)».', up: status ? status.comfy : null },
          { key: 'comfyWorkflowsDir', label: 'Папка со схемами ComfyUI', help: 'Схемы в формате API: image-z-image-turbo.json, video-ltx25-image-to-video.json и другие. Схемы музыки есть в самом приложении.' },
          { key: 'voiceStudioUrl', label: 'VoiceStudio — голоса и клоны голоса', help: 'Голос выбирается в каждом проекте на шаге «Идея».', up: status ? status.voiceStudio : null }
        ]}
      />
      <div className="flex flex-col gap-2.5 border-t border-dashed border-line pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
          <span className="flex items-center gap-1.5">ComfyUI <UpBadge up={status ? status.comfy : null} /></span>
          <span className="flex items-center gap-1.5">
            Схемы{' '}
            {status ? (
              status.workflows == null ? (
                <Badge tone="bad">папка не найдена</Badge>
              ) : (
                <Badge tone={status.workflows ? 'ok' : 'warn'}>{status.workflows} шт.</Badge>
              )
            ) : (
              <UpBadge up={null} />
            )}
          </span>
          <span className="flex items-center gap-1.5">VoiceStudio <UpBadge up={status ? status.voiceStudio : null} /></span>
          <span className="flex items-center gap-1.5">Ollama <UpBadge up={status ? !!status.ollama : null} /></span>
          <span className="flex-1" />
          <Button size="sm" loading={!status} onClick={check}>
            Проверить
          </Button>
        </div>
        <p className="text-[13px] text-ink-2">
          {status && !status.comfy
            ? 'ComfyUI не отвечает: запустите ярлык «ComfyUI (картинки и видео)» и нажмите «Проверить».'
            : status && !status.voiceStudio
              ? 'VoiceStudio не отвечает: запустите приложение VoiceStudio, если нужны клоны голоса.'
              : 'Адрес Ollama (локальный автор сценария) задаётся в «ИИ-сервисы и ключи › Автор сценария», вариант «Свой endpoint».'}
        </p>
      </div>
    </section>
  )
}

/** «Проверить»: browser-harness, the connection to Chrome, the Flow project and the Google sign-in — nothing is opened or spent. */
function ChromeCheckRow() {
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<ChromeCheck | null>(null)
  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      setR(await window.api.chrome.check())
    } finally {
      setBusy(false)
    }
  }
  const item = (ok: boolean | null, text: ReactNode, hint?: ReactNode): ReactNode => (
    <li className="flex items-start gap-2 text-[13px]">
      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-ok-ink" strokeWidth={3} /> : <X className={cx('mt-0.5 size-4 shrink-0', ok === null ? 'text-muted' : 'text-bad-ink')} strokeWidth={3} />}
      <span className="flex flex-col">
        <span>{text}</span>
        {hint && !ok && <span className="text-xs text-ink-2">{hint}</span>}
      </span>
    </li>
  )
  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-line pt-4">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] text-ink-2">Проверка ничего не открывает и не тратит бонусы.</span>
        <Button loading={busy} onClick={() => void run()}>
          {busy ? 'Проверяем…' : 'Проверить'}
        </Button>
      </div>
      {r && (
        <ul className="flex flex-col gap-1.5">
          {item(r.harness, 'browser-harness найден', r.error ?? 'Укажите путь к browser-harness выше.')}
          {r.harness &&
            item(
              r.chrome,
              'Chrome подключён',
              'Откройте chrome://inspect/#remote-debugging, включите «Allow remote debugging» и нажмите «Разрешить» во всплывающем окне Chrome.'
            )}
          {r.chrome &&
            item(r.signedIn, r.signedIn === null ? 'Вход в Google не удалось проверить' : 'Вход в Google есть', 'Войдите в аккаунт Google в этом Chrome — с подпиской на Flow и Gemini.')}
          {r.chrome &&
            item(
              !!r.flowMatch,
              r.flowMatch ? (
                <>
                  Проект Google Flow открыт: <span className="font-mono text-xs">{r.flowTabs.find((t) => t.url === r.flowMatch)?.title || r.flowMatch}</span>
                </>
              ) : (
                'Проект Google Flow не открыт'
              ),
              r.flowTabs.length
                ? `Открыты другие проекты Flow (${r.flowTabs.length}), а в поле выше указан иной. Очистите поле или откройте нужный проект.`
                : 'Откройте flow.google.com, войдите в проект, где лежат ваши персонажи, и оставьте вкладку открытой.'
            )}
          {r.chrome && item(true, r.geminiTab ? 'Gemini открыт во вкладке' : 'Для музыки Gemini откроет свою вкладку сам')}
        </ul>
      )}
    </div>
  )
}

/** Google services used through the user's own Chrome: video in Flow, music in Gemini. */
function ChromeSection({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  return (
    <>
      <SectionTitle
        icon={<Globe className="size-5" />}
        title="Google в Chrome"
        sub="Видео в Google Flow и музыка в Gemini — через ваш Chrome и вашу подписку, без ключа. Приложение управляет вкладкой само."
      />
      <Card>
        <AddressFields
          settings={settings}
          onSettings={onSettings}
          fields={[
            {
              key: 'flowProjectUrl',
              label: 'Проект Google Flow (необязательно)',
              help: 'Адрес flow.google.com/project/…, открытого в Chrome. Пусто — первая открытая вкладка проекта Flow. Каждое видео тратит бонусы Flow.'
            },
            { key: 'browserHarness', label: 'browser-harness — управление Chrome', help: 'Пусто — найдётся сам (~/.local/bin). В Chrome должна быть включена удалённая отладка.' }
          ]}
        />
        <ChromeCheckRow />
      </Card>
    </>
  )
}

/** Edited locally, saved when the field loses focus (no write per keystroke). */
function PronunciationBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  return (
    <textarea
      rows={6}
      value={text}
      spellCheck={false}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
      className={cx(inputCls, 'resize-y py-2.5 font-mono text-[13px] leading-relaxed')}
    />
  )
}

function TtsSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const provider = settings.defaultTtsProvider
  const keyProvider: 'gemini' | 'elevenlabs' = provider === 'elevenlabs' ? 'elevenlabs' : 'gemini'
  const status = provider === 'voicestudio' ? undefined : statusOf(keyProvider)
  const ready = provider !== 'voicestudio' && !!status?.configured && status.lastOk !== false
  const models = useModels(provider === 'elevenlabs' ? 'elevenlabs' : 'gemini-tts', ready)
  // VoiceStudio needs no key: its badge says whether the app answers at its address.
  const [vsUp, setVsUp] = useState<boolean | null>(null)
  useEffect(() => {
    void window.api.settings
      .localStatus()
      .then((s) => setVsUp(s.voiceStudio))
      .catch(() => setVsUp(false))
  }, [settings.voiceStudioUrl])
  const options: ProviderOption<TtsProvider>[] = [
    {
      id: 'voicestudio',
      name: 'VoiceStudio (локально)',
      note: 'Голоса на этом компьютере, в том числе клоны: без ключа и без оплаты.',
      logo: 'custom',
      badge: <UpBadge up={vsUp} />
    },
    {
      id: 'gemini',
      name: 'Gemini TTS',
      note: 'Голоса Google Gemini: 30 вариантов, есть русский язык.',
      logo: 'gemini',
      status: statusOf('gemini')
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      note: 'Очень естественные голоса и точные тайминги слов для караоке-субтитров.',
      logo: 'elevenlabs',
      status: statusOf('elevenlabs')
    }
  ]
  const value = provider === 'gemini' ? settings.geminiTtsModel : settings.elevenModel
  return (
    <>
      <SectionTitle
        icon={<Mic className="size-5" />}
        title="Голос рассказчика (TTS)"
        sub="Сервис озвучки по умолчанию для новых проектов. В каждом проекте его можно сменить на шаге «Идея»."
      />
      <ProviderSelect value={provider} options={options} onChange={async (id) => onSettings(await window.api.settings.set({ defaultTtsProvider: id }))} />
      {provider === 'voicestudio' ? (
        <Card key={provider}>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Ключ не нужен. Адрес VoiceStudio задаётся в блоке «Локальные модели», голос выбирается в каждом проекте на шаге «Идея».
          </p>
          {vsUp === false && (
            <p className="mt-2 text-[13px] font-semibold text-bad-ink">
              VoiceStudio не отвечает по адресу {settings.voiceStudioUrl}. Запустите приложение VoiceStudio и откройте эту страницу снова.
            </p>
          )}
        </Card>
      ) : (
      <Card key={provider}>
        <KeyForm
          provider={keyProvider}
          name={keyProvider === 'gemini' ? 'Google Gemini' : 'ElevenLabs'}
          status={status}
          help={provider === 'gemini' ? 'Ключ Gemini из Google AI Studio.' : 'API-ключ из аккаунта ElevenLabs.'}
          hint={provider === 'gemini' && settings.llmProvider === 'gemini' ? 'Этот же ключ использует автор сценария Gemini.' : undefined}
          link={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://elevenlabs.io/app/settings/api-keys'}
          linkLabel={provider === 'gemini' ? 'Создать ключ в Google AI Studio' : 'Создать ключ в ElevenLabs'}
          onChanged={onChanged}
          onSaved={(r) => r.ok && void models.refresh()}
        />
        {ready && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="text-sm font-semibold">Модель озвучки</span>
            <ModelPicker
              value={value}
              models={models.models}
              loading={models.loading}
              error={models.error}
              fetchedAt={models.fetchedAt}
              onChange={async (id) => onSettings(await window.api.settings.set(provider === 'gemini' ? { geminiTtsModel: id } : { elevenModel: id }))}
              onRefresh={() => void models.refresh()}
            />
          </div>
        )}
      </Card>
      )}
    </>
  )
}

function HiggsfieldSection({ status, onChanged }: { status?: KeyStatus; onChanged: () => void }) {
  return (
    <>
      <SectionTitle icon={<ImageIcon className="size-5" />} title="Картинки и видео" sub="Higgsfield создаёт картинки для клипов, листы персонажей и ИИ-видео." />
      <Card>
        <div className="flex items-center gap-3">
          <ProviderLogo id="higgsfield" />
          <div className="flex flex-1 flex-col">
            <span className="text-base font-bold">Higgsfield</span>
            <span className="text-[13px] text-ink-2">GPT Image 2.5, Kling, Seedance и другие модели из вашего аккаунта Higgsfield</span>
          </div>
          <StatusBadge status={status} />
        </div>
        <KeyForm
          provider="higgsfield"
          name="Higgsfield"
          status={status}
          placeholder="Вставьте ключ из кнопки Copy API key"
          hint={
            <>
              В консоли Higgsfield откройте API Keys, нажмите <strong className="text-ink">Copy API key</strong> и вставьте сюда. Формат{' '}
              <code className="rounded bg-sand px-1 font-mono text-xs">KEY_ID:KEY_SECRET</code>. Если Key ID и Secret у вас по отдельности, соедините их
              двоеточием.
            </>
          }
          help="Ключ проверяется запросом оценки стоимости — кредиты не тратятся."
          link="https://higgsfield.ai/s/higgsfield-api-yt-bangtutorial-lPMrHK"
          linkLabel="Открыть консоль Higgsfield"
          onChanged={onChanged}
        />
        <p className="flex items-start gap-2.5 border-t border-dashed border-line pt-4 text-[13px] leading-relaxed text-ink-2">
          <Film className="mt-0.5 size-4 shrink-0" />
          <span>
            Доступны все модели Higgsfield: для картинок — {HF_IMAGE_MODELS.length}, для видео — {HF_VIDEO_MODELS.length}. Модель выбирается в каждом
            проекте на шаге <strong className="text-ink">Идея</strong>, в разделе ИИ-моделей.
          </span>
        </p>
      </Card>
    </>
  )
}

/** The built-in caption look of a new project (main/repo.ts DEFAULT_EDITOR). */
const DEFAULT_CAPTION_LOOK: CaptionLook = { captionStyle: 'karaoke', captionPosition: 'bawah', captionSize: 'sedang' }

export function Settings() {
  const { go, route } = useApp()
  const back = route.name === 'settings' && route.back ? route.back : ({ name: 'home' } as const)
  const [tab, setTab] = useState<Tab>('services')
  const [previewAspect, setPreviewAspect] = useState<'9:16' | '16:9'>('9:16')
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folder, setFolder] = useState('')

  const reload = (): void => {
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.get().then(setSettings)
  }
  useEffect(() => {
    reload()
    void window.api.exporter.defaultFolder().then(setFolder)
  }, [])

  const statusOf = (p: ApiProvider): KeyStatus | undefined => keys.find((k) => k.provider === p)

  const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'services', label: 'ИИ-сервисы и ключи', icon: <KeyRound className="size-[18px]" /> },
    { id: 'models', label: 'Локальные модели', icon: <HardDriveDownload className="size-[18px]" /> },
    { id: 'usage', label: 'Расходы', icon: <Wallet className="size-[18px]" /> },
    { id: 'characters', label: 'Персонажи', icon: <UsersRound className="size-[18px]" /> },
    { id: 'captions', label: 'Субтитры', icon: <Captions className="size-[18px]" /> },
    { id: 'general', label: 'Общие', icon: <SlidersHorizontal className="size-[18px]" /> },
    { id: 'about', label: 'О приложении', icon: <Info className="size-[18px]" /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-line bg-surface px-8">
        <button type="button" onClick={() => go({ name: 'home' })}>
          <Logo />
        </button>
        <span className="text-xl text-line-3">/</span>
        <span className="font-semibold">Настройки</span>
        <div className="flex-1" />
        <Button icon={<ArrowLeft className="size-[18px]" />} onClick={() => go(back)}>
          {back.name === 'project' ? 'Назад к проекту' : 'На главную'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Разделы настроек" className="flex flex-col gap-1 border-r border-line pl-6 pr-4 pt-7">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => setTab(n.id)}
              className={cx(
                'flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px]',
                tab === n.id ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink hover:bg-sand'
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
          {tab === 'captions' && settings && (
            // The preview stays in view while the settings on the right scroll.
            <div className="sticky top-4 mt-6 flex flex-col items-center gap-2.5">
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold">Предпросмотр</span>
                <Segmented
                  size="sm"
                  value={previewAspect}
                  onChange={setPreviewAspect}
                  options={[
                    { id: '9:16', label: '9:16' },
                    { id: '16:9', label: '16:9' }
                  ]}
                />
              </div>
              <CaptionPreview look={{ ...DEFAULT_CAPTION_LOOK, ...settings.captionDefaults }} aspect={previewAspect} width={previewAspect === '9:16' ? 200 : 236} />
            </div>
          )}
        </nav>
        <main className="scroll-thin overflow-y-auto">
          <div className="flex max-w-[900px] flex-col gap-3.5 px-14 pb-24 pt-8">
            {tab === 'services' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">ИИ-сервисы и ключи</h1>
                  <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
                    Облачные сервисы через ваши собственные аккаунты. Ключи хранятся в зашифрованном виде на этом компьютере и отправляются
                    только напрямую в нужный сервис. То, что работает без интернета, — на вкладке «Локальные модели».
                  </p>
                </div>
                <LlmSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <TtsSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <HiggsfieldSection status={statusOf('higgsfield')} onChanged={reload} />
                <ChromeSection settings={settings} onSettings={setSettings} />
              </>
            )}

            {tab === 'usage' && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Расходы</h1>
                  <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
                    Сколько стоит генерация: всего, по папкам и по видео. Учитываются токены автора сценария и озвучки, кредиты Higgsfield, бонусы Google Flow,
                    треки Lyria и время видеокарты на этом компьютере.
                  </p>
                </div>
                <section className="rounded-2xl border border-line bg-surface p-5">
                  <UsageView overall />
                </section>
              </>
            )}

            {tab === 'models' && settings && (
              <LocalModelsSection
                connection={<LocalConnection settings={settings} onSettings={setSettings} />}
                footer={<WhisperSection settings={settings} onSettings={setSettings} />}
              />
            )}

            {tab === 'general' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Общие</h1>
                  <p className="mt-2 text-[15px] text-ink-2">Настройки по умолчанию для новых проектов.</p>
                </div>
                <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6">
                  <span className="text-sm font-semibold">Папка проектов на диске</span>
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-[12px] text-ink-2">
                      {settings.projectsDir || 'по умолчанию: папка приложения (…\\Bang Story\\projects)'}
                    </span>
                    <Button
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: 'Перенести проекты в другую папку?',
                          body: 'Все проекты (кадры, видео, звук) будут скопированы в выбранную папку, и приложение станет работать оттуда. Старые копии удалятся после переноса. Выберите пустую папку.',
                          confirm: 'Выбрать папку',
                          cancel: 'Отмена'
                        })
                        if (!ok) return
                        try {
                          const s2 = await window.api.settings.pickProjectsDir()
                          if (s2) setSettings(s2)
                        } catch (e) {
                          alert(errorText(e))
                        }
                      }}
                    >
                      Выбрать папку
                    </Button>
                  </div>
                  <span className="text-[13px] text-muted">Папки на главной («Все папки», «+ Папка») — для порядка в списке; они не меняют, где лежат файлы.</span>
                </section>
                <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
                  <Field label="Язык сценария и озвучки по умолчанию">
                    <Select
                      label="Язык сценария и озвучки по умолчанию"
                      value={settings.defaultLanguage}
                      onChange={async (v) => setSettings(await window.api.settings.set({ defaultLanguage: v }))}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                      className="max-w-[320px]"
                    />
                  </Field>
                  <Field
                    label="Произношение для голоса"
                    hint="По строке на правило: «как написано = как произносить». Применяется к тексту перед озвучкой; субтитры остаются как в сценарии. Ударение — знак ́ после гласной."
                  >
                    <PronunciationBox value={settings.pronunciations} onSave={async (v) => setSettings(await window.api.settings.set({ pronunciations: v }))} />
                  </Field>
                  <Field label="Папка экспорта">
                    <div className="flex gap-2">
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-sand px-3.5 font-mono text-[13px]">
                        <FolderOpen className="size-[17px] shrink-0 text-ink-2" />
                        <span className="truncate">{folder}</span>
                      </div>
                      <Button
                        className="h-11"
                        onClick={async () => {
                          const f = await window.api.exporter.pickFolder()
                          if (f) setFolder(f)
                        }}
                      >
                        Сменить папку
                      </Button>
                    </div>
                  </Field>
                </section>
              </>
            )}

            {tab === 'characters' && <LibrarySection />}
            {tab === 'captions' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Субтитры</h1>
                  <p className="mt-2 text-[15px] text-ink-2">
                    Как выглядят субтитры в новых проектах. В открытом проекте их меняют в редакторе, на вкладке «Субтитры».
                  </p>
                </div>
                <section className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <CaptionSettings
                    look={{ ...DEFAULT_CAPTION_LOOK, ...settings.captionDefaults }}
                    onChange={(patch) => {
                      const captionDefaults = { ...settings.captionDefaults, ...patch }
                      setSettings({ ...settings, captionDefaults })
                      void window.api.settings.set({ captionDefaults })
                    }}
                    aspect="9:16"
                    previewWidth={240}
                    hidePreview
                  />
                </section>
              </>
            )}
            {tab === 'about' && <AboutSection />}
          </div>
        </main>
      </div>
    </div>
  )
}
