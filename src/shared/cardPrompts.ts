/**
 * Prompts for a character's portrait and model sheet made from one photo of the person (an image-editing model:
 * Qwen-Image 2.1 locally, or ChatGPT / any other editor by hand). The same texts are shown in the ⓘ tips of the
 * character form, so the user can make the pictures elsewhere too.
 */

export const PORTRAIT_PROMPT =
  'Create a clean studio portrait photograph of the same person from the reference image, keeping their face, hair, facial hair, eyes and outfit exactly. ' +
  'Head and shoulders, facing the camera, calm natural expression. Plain light warm-grey seamless studio background, soft diffused key light, ' +
  'realistic skin texture, sharp focus. No text, no captions, no titles anywhere in the image.'

export const SHEET_PROMPT =
  'Create a professional character reference sheet of the same person from the reference image, keeping their face, hair, facial hair and outfit exactly, ' +
  'on a plain light warm-grey studio background, photorealistic. Layout: left — a large head-and-shoulders close-up portrait; center — five full-body ' +
  'standing views in a row: front, three-quarter, side profile, three-quarter back, back, relaxed pose, full outfit and shoes visible; right — a 2×3 grid ' +
  'of head shots with different expressions: neutral, big smile, looking up thoughtfully, frowning, surprised, winking; bottom left — four detail close-ups: ' +
  'eye, mouth and facial hair, hair or headwear texture, a characteristic clothing detail; bottom right — three medium shots seated at a white table: ' +
  'hands clasped, explaining with open hands, chin on hand. Consistent soft studio lighting, thin white gutters between panels. No text, no labels.'

/** For a vision chat (ChatGPT, Gemini): the appearance field, as the image prompts want it. */
export const APPEARANCE_PROMPT =
  'Опиши человека на фото для генератора изображений, одним абзацем по-английски: "human man/woman", возраст, телосложение, тон кожи, лицо, ' +
  'волосы, растительность на лице, постоянные приметы. Затем отдельной фразой "Default outfit: …" — одежда, цвета, материалы, аксессуары. ' +
  'Без имени, без художественных слов о стиле.'

/** For a vision chat with the video attached: the manner field. */
export const MANNER_PROMPT =
  'Посмотри видео и опиши по-русски, как человек держится и двигается в кадре: как стоит или сидит относительно камеры, что делает корпус, ' +
  'где сосредоточены движения, ходит ли по кадру. Затем строка «Характерная жестикуляция:» и 4–6 пунктов с «- » о его реальных жестах. ' +
  'В конце — одно предложение об общей энергии жестов. Только то, что видно.'

/** For a vision chat with the video attached: the head, gaze and face field. */
export const EXPRESSION_PROMPT =
  'Посмотри видео и опиши по-русски голову, взгляд и мимику человека: куда смотрит (в объектив, вниз, в сторону), как двигает головой ' +
  '(кивки, наклоны, повороты), чем передаёт эмоции (глаза, брови, улыбка) и какое общее впечатление производит. Одним абзацем, только то, что видно.'
