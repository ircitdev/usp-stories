import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Film, Image as ImageIcon, Move, Users } from 'lucide-react'
import { effectiveResolution, fitDuration, getImageModel, getVideoModel, hfModelOptions, isLocalModel, maxRefs, resolutionOptions } from '@shared/higgsfield'
import type { CreditEstimate, ModelOption, Project } from '@shared/types'
import { ModelLogo } from '../../components/ModelLogo'
import { ModelPicker } from '../../components/ModelPicker'
import { Segmented, Spinner } from '../../components/ui'
import { creditLabel } from '../../lib/format'
import { useEstimate, useEstimates } from '../../lib/useEstimate'

const IMAGE_OPTIONS = hfModelOptions('image')
const VIDEO_OPTIONS = hfModelOptions('video')
const IMAGE_IDS = IMAGE_OPTIONS.map((o) => o.id)
const VIDEO_IDS = VIDEO_OPTIONS.map((o) => o.id)

/** Adds each model's estimated credits to its picker row once a Higgsfield key is known to exist. */
function withCosts(options: ModelOption[], costs: Record<string, CreditEstimate | null>, unit: (id: string) => string, on: boolean): ModelOption[] {
  if (!on) return options
  return options.map((o) => ({
    ...o,
    credits: o.id in costs ? (costs[o.id]?.credits ?? null) : undefined,
    usd: costs[o.id]?.usd ?? null,
    creditUnit: unit(o.id)
  }))
}

function Cost({
  value,
  hasKey,
  local,
  children
}: {
  value: CreditEstimate | null | undefined
  hasKey: boolean | null
  /** Runs on this computer: no credits, no key. */
  local?: boolean
  children: (credits: number) => ReactNode
}) {
  if (local) return <span className="font-semibold text-ok-ink">Бесплатно — генерация на этом компьютере</span>
  if (hasKey === false) return <span className="text-muted">Оценка в кредитах появится, когда вы добавите ключ Higgsfield в настройках.</span>
  if (value === undefined)
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <Spinner className="size-3" />
        Считаем кредиты…
      </span>
    )
  if (value === null) return <span className="text-muted">Оценка в кредитах пока недоступна.</span>
  return <span>{children(value.credits)}</span>
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line-2 bg-surface p-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {icon}
        {title}
      </span>
      {children}
    </div>
  )
}

/** Which Higgsfield models draw and animate this project's clips. */
export function ModelSection({
  project,
  clipCount,
  perClip,
  onChange
}: {
  project: Project
  clipCount: number
  perClip: number
  onChange: (patch: { imageModel?: string; videoModel?: string; videoResolution?: string | null }) => void
}) {
  const image = getImageModel(project.imageModel)
  const video = getVideoModel(project.videoModel)
  const seconds = fitDuration(video, perClip) ?? perClip
  const imageCost = useEstimate('image', image.id, project.aspectRatio)
  const resolutions = resolutionOptions(video)
  const resolution = effectiveResolution(video, project.videoResolution)
  const videoCost = useEstimate('video', video.id, project.aspectRatio, perClip, resolution)
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(() => {
    void window.api.settings.keys().then((keys) => setHasKey(!!keys.find((k) => k.provider === 'higgsfield')?.configured))
  }, [])

  const imageCosts = useEstimates('image', IMAGE_IDS, project.aspectRatio, undefined, hasKey === true)
  const videoCosts = useEstimates('video', VIDEO_IDS, project.aspectRatio, perClip, hasKey === true)
  const imageModels = useMemo(() => withCosts(IMAGE_OPTIONS, imageCosts, () => '', hasKey === true), [imageCosts, hasKey])
  const videoModels = useMemo(
    () => withCosts(VIDEO_OPTIONS, videoCosts, (id) => `${fitDuration(getVideoModel(id), perClip)} с`, hasKey === true),
    [videoCosts, perClip, hasKey]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">ИИ-модели</span>
        <span className="text-[13px] text-muted">
          Картинки: {IMAGE_OPTIONS.length}, видео: {VIDEO_OPTIONS.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card icon={<ImageIcon className="size-4" />} title="Картинки клипов">
          <ModelPicker
            value={image.id}
            models={imageModels}
            footerNote={hasKey ? 'кредиты за картинку, оценка Higgsfield для вашего аккаунта' : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Рекомендуем', 'Локально', 'Референс', 'GPT Image', 'Soul', 'Recraft', '4K']}
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ imageModel: id })}
          />
          <p className="text-[12.5px] leading-snug text-ink-2">
            <Cost local={isLocalModel(image)} value={imageCost} hasKey={hasKey}>
              {(c) => (
                <>
                  ≈ {creditLabel(c)} кред. за картинку · {clipCount} шт. ≈ <b className="font-semibold text-ink">{creditLabel(c * clipCount)} кред.</b>
                </>
              )}
            </Cost>
          </p>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Users className="mt-px size-3.5 shrink-0" />
            {maxRefs(image)
              ? 'Учитывает листы персонажей: лица и костюмы героев одинаковые во всех клипах.'
              : 'Без листов персонажей: внешность героев может немного меняться от клипа к клипу.'}
          </p>
        </Card>
        <Card icon={<Film className="size-4" />} title="ИИ-видео">
          <ModelPicker
            value={video.id}
            models={videoModels}
            footerNote={hasKey ? `кредиты за видео для клипа ±${perClip} с` : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Рекомендуем', 'Локально', 'Kling', 'Seedance', 'Wan', 'Референс', '4K']}
            align="right"
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ videoModel: id })}
          />
          {resolutions.length > 1 ? (
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[12.5px] font-medium text-ink-2">Разрешение</span>
              <Segmented
                size="sm"
                value={resolution ?? resolutions[0]}
                onChange={(v) => onChange({ videoResolution: v })}
                options={resolutions.map((r) => ({ id: r, label: r.toUpperCase() === '4K' || r.toUpperCase() === '2K' ? r.toUpperCase() : r }))}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            resolution && <p className="text-[12.5px] text-ink-2">Разрешение {resolution} (у этой модели другого нет)</p>
          )}
          <p className="text-[12.5px] leading-snug text-ink-2">
            <Cost local={isLocalModel(video)} value={videoCost} hasKey={hasKey}>
              {(c) => (
                <>
                  ≈ {creditLabel(c)} кред. за видео {seconds} с{resolution ? `, ${resolution}` : ''}
                </>
              )}
            </Cost>
          </p>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Move className="mt-px size-3.5 shrink-0" />
            Только для клипов, которые вы сделали ИИ-видео. Движение камеры бесплатно.
          </p>
        </Card>
      </div>
    </div>
  )
}
