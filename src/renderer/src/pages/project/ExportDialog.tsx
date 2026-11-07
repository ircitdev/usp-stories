import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FolderOpen, RotateCcw } from 'lucide-react'
import type { ExportOptions, Job } from '@shared/types'
import { Button, Modal, Progress, Switch, cx, inputCls } from '../../components/ui'
import { clipNumber, errorText, mmss, plural } from '../../lib/format'
import { useApp } from '../../store/app'
import { isRunning, useProject } from '../../store/project'

const RESOLUTIONS: { id: ExportOptions['resolution']; label: string; sub: string; mb: number }[] = [
  { id: 720, label: '720p', sub: 'Легче файл', mb: 0.4 },
  { id: 1080, label: '1080p', sub: 'Рекомендуем', mb: 0.75 },
  { id: 2160, label: '4K', sub: 'Дольше рендер', mb: 2.4 }
]

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'video'
  )
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { project, clips, jobs, flush } = useProject()
  const { toast } = useApp()
  const [opts, setOpts] = useState<ExportOptions | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !project) return
    // A finished or failed export is not shown again; an export still running keeps its progress.
    setJobId((id) => (id && isRunning(useProject.getState().jobs[id]) ? id : null))
    void window.api.exporter.defaultFolder(project.id).then((folder) =>
      setOpts({
        fileName: slug(project.title),
        resolution: 1080,
        fps: 30,
        burnCaptions: project.editor.captionStyle !== 'none',
        writeSrt: false,
        normalizeAudio: true,
        duckMusic: project.editor.duckMusic,
        folder
      })
    )
  }, [open])

  if (!project || !opts) return null
  const job: Job | null = jobId ? (jobs[jobId] ?? null) : null
  const running = isRunning(job)
  const totalMs = clips.reduce((n, c) => n + c.durationMs, 0)
  const missing = clips
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !(c.imageAssetId || (c.motionType === 'video' && c.videoAssetId)))
  const noVoice = clips.filter((c) => !c.audioAssetId).length
  const res = RESOLUTIONS.find((r) => r.id === opts.resolution)!
  const sizeMb = Math.round((totalMs / 1000) * res.mb * (opts.fps === 60 ? 1.5 : 1))
  const set = (p: Partial<ExportOptions>): void => setOpts({ ...opts, ...p })

  const start = async (): Promise<void> => {
    try {
      await flush()
      const j = await window.api.exporter.start(project.id, opts)
      useProject.getState().upsertJob(j)
      setJobId(j.id)
      // The export goes on in the background: its progress is in the header's task list, a notice comes when it is done.
      onClose()
      toast('info', 'Экспорт идёт — прогресс в задачах вверху. Когда видео будет готово, придёт уведомление.')
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const toggles: { key: keyof ExportOptions; title: string; desc: string; disabled?: boolean }[] = [
    {
      key: 'burnCaptions',
      title: 'Вшить субтитры в видео',
      desc: project.editor.captionStyle === 'none' ? 'В стиле субтитров выбрано «Без субтитров»' : 'Субтитры станут частью картинки',
      disabled: project.editor.captionStyle === 'none'
    },
    { key: 'writeSrt', title: 'Сохранить и файл субтитров (.srt)', desc: 'Чтобы загрузить на YouTube отдельно' },
    { key: 'normalizeAudio', title: 'Выровнять громкость', desc: 'Нормализация до −14 LUFS, стандарт YouTube' },
    {
      key: 'duckMusic',
      title: 'Приглушать музыку под голос',
      desc: project.editor.musicAssetId ? 'Музыка сама становится тише, когда звучит голос' : 'Фоновой музыки пока нет',
      disabled: !project.editor.musicAssetId
    }
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Экспорт видео"
      subtitle={`${project.title} · ${mmss(totalMs)} · ${clips.length} ${plural(clips.length, ['клип', 'клипа', 'клипов'])} · ${project.aspectRatio}`}
      width={640}
    >
      {job?.status === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-12 text-ok-ink" />
          <p className="text-lg font-semibold">Видео экспортировано</p>
          <p className="break-all font-mono text-[13px] text-ink-2">{job.message}</p>
          <div className="flex gap-2.5">
            <Button icon={<FolderOpen className="size-4" />} onClick={() => job.message && void window.api.exporter.reveal(job.message)}>
              Открыть папку
            </Button>
            <Button icon={<RotateCcw className="size-4" />} onClick={() => setJobId(null)}>
              Экспортировать ещё раз
            </Button>
            <Button variant="ink" onClick={onClose}>
              Готово
            </Button>
          </div>
        </div>
      ) : (
        <>
          {missing.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-sun bg-sun-soft px-3.5 py-2.5 text-[13px] text-sun-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {missing.length === 1 ? 'У клипа' : 'У клипов'} {missing.map(({ i }) => clipNumber(i)).join(', ')} нет картинки. Создайте её на шаге «Раскадровка» перед экспортом.
              </span>
            </div>
          )}
          {missing.length === 0 && noVoice > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-sand px-3.5 py-2.5 text-[13px] text-ink-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{noVoice === 1 ? 'Один клип пока без озвучки — он пойдёт без голоса и без субтитров.' : `${noVoice} ${plural(noVoice, ['клип', 'клипа', 'клипов'])} пока без озвучки — они пойдут без голоса и без субтитров.`}</span>
            </div>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Имя файла</span>
            <div className="flex h-[46px] overflow-hidden rounded-xl border border-line-2">
              <input value={opts.fileName} onChange={(e) => set({ fileName: e.target.value })} className="flex-1 px-3.5 text-[15px] outline-none" />
              <span className="flex items-center border-l border-line-2 bg-sand px-3.5 font-mono text-sm text-ink-2">.mp4</span>
            </div>
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-3.5">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Разрешение</span>
              <div className="grid grid-cols-3 gap-1.5">
                {RESOLUTIONS.map((r) => {
                  const on = r.id === opts.resolution
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ resolution: r.id })}
                      className={cx('flex h-14 flex-col items-center justify-center rounded-xl', on ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 hover:border-ink-2')}
                    >
                      <span className="text-[15px] font-semibold">{r.label}</span>
                      <span className="text-xs text-ink-2">{r.sub}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Частота кадров</span>
              <div className="grid grid-cols-2 gap-1.5">
                {([30, 60] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={opts.fps === f}
                    onClick={() => set({ fps: f })}
                    className={cx(
                      'h-14 rounded-xl text-[15px] font-semibold',
                      opts.fps === f ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 hover:border-ink-2'
                    )}
                  >
                    {f} fps
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col rounded-[14px] border border-line">
            {toggles.map((t, i) => (
              <div key={t.key} className={cx('flex items-center gap-3.5 px-3.5 py-2.5', i > 0 && 'border-t border-line', t.disabled && 'opacity-60')}>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-semibold">{t.title}</span>
                  <span className="text-[13px] text-muted">{t.desc}</span>
                </div>
                <Switch on={!!opts[t.key] && !t.disabled} onChange={(v) => !t.disabled && set({ [t.key]: v })} label={t.title} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Куда сохранить</span>
            <div className="flex gap-2">
              <div className={cx(inputCls, 'flex h-11 min-w-0 flex-1 items-center gap-2.5 bg-sand font-mono text-[13px]')}>
                <FolderOpen className="size-[17px] shrink-0 text-ink-2" />
                <span className="truncate">{opts.folder}</span>
              </div>
              <Button
                className="h-11"
                onClick={async () => {
                  const f = await window.api.exporter.pickFolder()
                  if (f) set({ folder: f })
                }}
              >
                Сменить папку
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-[14px] bg-sand px-3.5 py-3">
            <div className="flex flex-col">
              <span className="text-xs text-ink-2">Длительность</span>
              <span className="font-mono text-base font-semibold">{mmss(totalMs)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-2">Примерный размер</span>
              <span className="text-base font-semibold">± {sizeMb} МБ</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-ink-2">Стоимость</span>
              <span className="text-base font-semibold text-ok-ink">0 кредитов</span>
            </div>
          </div>
          {job && (running || job.status === 'failed') && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span className={job.status === 'failed' ? 'text-bad-ink' : 'text-ink-2'}>
                  {job.status === 'failed' ? job.error : (job.message ?? 'Готовим…')}
                </span>
                {running && <span className="font-mono">{Math.round(job.progress * 100)}%</span>}
              </div>
              {running && <Progress value={job.progress} />}
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <span className="flex-1 text-[13px] text-muted">
              {running && 'Окно можно закрыть — экспорт продолжится.'}
            </span>
            {running ? (
              <Button variant="danger" onClick={() => job && void window.api.generate.cancel(job.id)}>
                Остановить
              </Button>
            ) : (
              <Button onClick={onClose}>Отмена</Button>
            )}
            <Button variant="primary" size="lg" icon={<Download className="size-[18px]" />} loading={running} disabled={missing.length > 0} onClick={() => void start()}>
              {running ? 'Экспортируем…' : 'Начать экспорт'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
