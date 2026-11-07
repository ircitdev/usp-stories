import { ExpressionTip, FlowTip, MannerTip } from './CharacterTips'
import { TipLabel } from './InfoTip'
import { Field, cx, inputCls } from './ui'

const MANNER_HINT =
  'Как стоит и двигается в кадре: поза, корпус, характерные жесты. Попадает в промпт каждого видео с этим персонажем. Например: стоит фронтально к камере, держится уверенно; объясняет обеими руками на уровне груди, разводит ладони, показывая размер; поднимает одну руку, выделяя мысль; после мысли возвращает руки в спокойное положение. Жесты активные, без театральности.'
const FACE_HINT =
  'Куда смотрит и как выражает эмоции. Например: взгляд прямо в объектив, иногда коротко вниз, на руки; небольшие кивки и наклоны головы сопровождают речь; эмоции передаёт глазами и бровями. Впечатление — спокойный опытный специалист.'

/** The two acting fields of a character: how they hold themselves and move, and their head, gaze and face. */
export function MannerFields({
  manner,
  expression,
  flowName,
  onChange
}: {
  manner: string
  expression: string
  flowName: string
  onChange: (patch: { manner?: string; expression?: string; flowName?: string }) => void
}) {
  return (
    <>
      <Field
        label={
          <TipLabel text="Персонаж в Google Flow">
            <FlowTip />
          </TipLabel>
        }
        hint="Имя этого человека среди персонажей проекта Google Flow (например, Иван). Видео через Flow возьмут его внешность оттуда. Пусто — во Flow его нет."
      >
        <input value={flowName} onChange={(e) => onChange({ flowName: e.target.value })} placeholder="Например: Иван" className={cx(inputCls, 'h-11')} />
      </Field>
      <Field
        label={
          <TipLabel text="Манера держаться и двигаться">
            <MannerTip />
          </TipLabel>
        }
        hint={MANNER_HINT}
      >
        <textarea
          rows={4}
          value={manner}
          onChange={(e) => onChange({ manner: e.target.value })}
          className={cx(inputCls, 'resize-y py-2.5 text-sm leading-relaxed')}
        />
      </Field>
      <Field
        label={
          <TipLabel text="Голова, взгляд и мимика">
            <ExpressionTip />
          </TipLabel>
        }
        hint={FACE_HINT}
      >
        <textarea
          rows={3}
          value={expression}
          onChange={(e) => onChange({ expression: e.target.value })}
          className={cx(inputCls, 'resize-y py-2.5 text-sm leading-relaxed')}
        />
      </Field>
    </>
  )
}
