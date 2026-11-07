import { APPEARANCE_PROMPT, EXPRESSION_PROMPT, MANNER_PROMPT, PORTRAIT_PROMPT, SHEET_PROMPT } from '@shared/cardPrompts'
import { InfoTip } from './InfoTip'

/** The ⓘ tips of the character form, with the prompts that make each field in another neural network. */

export const PortraitTip = () => (
  <InfoTip title="Портрет" prompt={PORTRAIT_PROMPT} promptLabel="Промпт (приложите фото человека)">
    Главная картинка персонажа: лицо крупно и резко, без надписей и лишних людей. Её берут кадры и видео, где есть этот персонаж. Можно загрузить
    фото, сделать «Из видео» или «Сделать карту из портрета». В ChatGPT, Gemini или Flow приложите фото и вставьте промпт ниже.
  </InfoTip>
)

export const SheetTip = () => (
  <InfoTip title="Лист персонажа" prompt={SHEET_PROMPT} promptLabel="Промпт (приложите портрет)">
    Ракурсы, эмоции и детали одежды на одном листе. Видео-модели (MiniMax H3) берут из него лицо и одежду, поэтому персонаж узнаётся во всех
    сценах. Лучше всего — студийный лист по портрету: «Сделать карту из портрета» нарисует его на этом компьютере примерно за минуту.
  </InfoTip>
)

export const AppearanceTip = () => (
  <InfoTip title="Внешность" prompt={APPEARANCE_PROMPT} promptLabel="Промпт для ChatGPT или Gemini (приложите фото)">
    Описание по-английски для генератора картинок: возраст, телосложение, лицо, волосы, затем «Default outfit:» — одежда по умолчанию. Попадает в
    промпт каждого кадра с этим персонажем. Без имени и без слов о стиле рисовки.
  </InfoTip>
)

export const FlowTip = () => (
  <InfoTip title="Персонаж в Google Flow">
    Видео через Google Flow берут внешность из персонажей проекта Flow. Создайте во Flow персонажа по фото (Flow › Персонажи) и впишите сюда его
    имя ровно как там — например, «Иван». Пусто — Flow сделает человека по описанию, без точного лица.
  </InfoTip>
)

export const MannerTip = () => (
  <InfoTip title="Манера держаться и двигаться" prompt={MANNER_PROMPT} promptLabel="Промпт для Gemini или ChatGPT (приложите видео)">
    Как человек стоит, где его движения и какие у него жесты. Перед созданием видео поле сжимается в короткое указание по-английски и добавляется в
    промпт каждого клипа с этим персонажем. Проще всего — «Создать из видео».
  </InfoTip>
)

export const ExpressionTip = () => (
  <InfoTip title="Голова, взгляд и мимика" prompt={EXPRESSION_PROMPT} promptLabel="Промпт для Gemini или ChatGPT (приложите видео)">
    Куда смотрит, как двигает головой и чем показывает эмоции. Тоже уходит в промпт каждого видео с персонажем.
  </InfoTip>
)
