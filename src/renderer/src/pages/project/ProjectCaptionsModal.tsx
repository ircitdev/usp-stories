import { CaptionSettings } from '../../components/CaptionSettings'
import { Modal } from '../../components/ui'
import { useProject } from '../../store/project'

/** This project's captions, on any step: the same settings as Монтаж › Субтитры, with a live preview. */
export function ProjectCaptionsModal({ onClose }: { onClose: () => void }) {
  const { project, clips, assets, selectedClipId, updateEditor } = useProject()
  if (!project) return null
  const clip = clips.find((c) => c.id === selectedClipId && c.imageAssetId) ?? clips.find((c) => c.imageAssetId) ?? null
  const image = clip?.imageAssetId ? (assets[clip.imageAssetId]?.url ?? null) : null
  return (
    <Modal open onClose={onClose} title="Субтитры проекта" subtitle="Меняются сразу в превью и в готовом видео. Пресеты общие для всех проектов." width={560}>
      <div className="-mx-7 -mb-4">
        <CaptionSettings
          look={project.editor}
          onChange={updateEditor}
          aspect={project.aspectRatio}
          image={image}
          text={clip?.narration.replace(/<[^>]+>/g, ' ')}
          previewWidth={project.aspectRatio === '9:16' ? 200 : 420}
        />
      </div>
    </Modal>
  )
}
