export type StyleCategory = '2d' | '3d' | 'realistis'

export interface VisualStyle {
  id: string
  name: string
  category: StyleCategory
  niche: string
  /** Tile colors used for the picker until a real sample image exists. */
  swatch: string
  ink: string
  /** Appended to every image prompt in the project. */
  prompt: string
  /** How characters should look on the character sheet. */
  characterHint: string
}

export const STYLE_CATEGORIES: { id: StyleCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'realistis', label: 'Реализм' }
]

const NO_TEXT = 'No text, no letters, no captions, no watermark, no logo.'

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'stickman',
    name: 'Цветные человечки',
    category: '2d',
    niche: 'История, реальные события',
    swatch: '#F2B266',
    ink: '#1F1D1A',
    prompt:
      '2D flat vector illustration frame for a YouTube storytelling video. Colorful, detailed flat background (never plain white). ALL characters are simple STICKMAN figures: thin black line bodies, arms and legs, plain round white heads with minimal cartoon faces (dot eyes, small eyebrows, simple mouth), no realistic anatomy. Each stickman wears only small costume pieces that match their role (hat, crown, sash, headcloth, props) while the stick body stays visible. Clean bold outlines, flat colors with light soft shading, every character in the same consistent stickman style, cinematic composition with depth. ' +
      NO_TEXT,
    characterHint: 'a stickman figure with a round white head and thin black line limbs, wearing role-specific costume pieces'
  },
  {
    id: 'flat',
    name: 'Плоский мультфильм',
    category: '2d',
    niche: 'Наука, факты, обучение',
    swatch: '#8CCBE3',
    ink: '#1F1D1A',
    prompt:
      'Flat vector explainer illustration, bold geometric shapes, a limited harmonious color palette, clean lines, friendly cartoon characters with simple features, soft subtle grain texture, clear readable composition. ' +
      NO_TEXT,
    characterHint: 'a friendly flat vector cartoon character with simple geometric features'
  },
  {
    id: 'whiteboard',
    name: 'Рисунок на доске',
    category: '2d',
    niche: 'Уроки, бизнес',
    swatch: '#FFFFFF',
    ink: '#1F1D1A',
    prompt:
      'Hand-drawn whiteboard doodle, black marker line art on a clean white board, one accent color used sparingly (red or blue), simple sketchy characters, arrows and small icons, like a whiteboard animation explainer. ' +
      NO_TEXT,
    characterHint: 'a simple hand-drawn marker doodle character'
  },
  {
    id: 'collage',
    name: 'Бумажный коллаж',
    category: '2d',
    niche: 'Документалистика, журналистика',
    swatch: '#E9D8BA',
    ink: '#1F1D1A',
    prompt:
      'Paper cut-out collage, layered textured paper, vintage photo cutouts, halftone print textures, torn edges, soft shadows between paper layers, editorial documentary style. ' +
      NO_TEXT,
    characterHint: 'a paper cut-out collage figure with textured paper layers'
  },
  {
    id: 'watercolor',
    name: 'Акварельная сказка',
    category: '2d',
    niche: 'Детские сказки, религия',
    swatch: '#CFE3B5',
    ink: '#1F1D1A',
    prompt:
      "Children's storybook watercolor illustration, soft washes on textured paper, warm pastel palette, cute expressive characters, whimsical and cozy mood. " +
      NO_TEXT,
    characterHint: 'a cute storybook watercolor character'
  },
  {
    id: 'anime',
    name: 'Аниме',
    category: '2d',
    niche: 'Драма, мотивация, вымысел',
    swatch: '#F5C3CD',
    ink: '#1F1D1A',
    prompt:
      'High-quality anime film still, clean cel shading, expressive characters, detailed painted background, cinematic lighting and color. ' +
      NO_TEXT,
    characterHint: 'an anime character with clean cel shading'
  },
  {
    id: 'noir',
    name: 'Комикс-нуар',
    category: '2d',
    niche: 'Хоррор, тру-крайм',
    swatch: '#2F3240',
    ink: '#FAF7F2',
    prompt:
      'Dark graphic-novel comic panel, heavy black ink shadows, high contrast, muted palette with a single accent color, dramatic angles, halftone texture, suspenseful mood. ' +
      NO_TEXT,
    characterHint: 'a graphic-novel character drawn with heavy ink shadows'
  },
  {
    id: 'pixel',
    name: 'Пиксель-арт',
    category: '2d',
    niche: 'Игры, ностальгия',
    swatch: '#8FD694',
    ink: '#1F1D1A',
    prompt: 'Detailed 16-bit pixel art scene, crisp pixels, limited retro palette, video game aesthetic, no blur. ' + NO_TEXT,
    characterHint: 'a 16-bit pixel art character sprite'
  },
  {
    id: 'animation3d',
    name: '3D-анимация',
    category: '3d',
    niche: 'Басни, семья, дети',
    swatch: '#FFD66B',
    ink: '#1F1D1A',
    prompt:
      '3D animated feature film render, stylized characters with big expressive faces, soft global illumination, subsurface scattering, vibrant colors, cinematic depth of field. ' +
      NO_TEXT,
    characterHint: 'a stylized 3D animated film character with an expressive face'
  },
  {
    id: 'clay',
    name: 'Пластилин',
    category: '3d',
    niche: 'Комедия, детские истории',
    swatch: '#F4A988',
    ink: '#1F1D1A',
    prompt:
      'Claymation stop-motion scene, handcrafted plasticine characters and miniature sets, visible fingerprints and clay texture, soft studio lighting. ' +
      NO_TEXT,
    characterHint: 'a handcrafted plasticine clay character'
  },
  {
    id: 'lowpoly',
    name: 'Низкополигональное 3D',
    category: '3d',
    niche: 'Технологии, наука',
    swatch: '#A7C7E7',
    ink: '#1F1D1A',
    prompt:
      'Low-poly 3D render, faceted geometric shapes, flat-shaded polygons, clean pastel colors, soft ambient lighting. ' + NO_TEXT,
    characterHint: 'a low-poly 3D character with faceted shapes'
  },
  {
    id: 'diorama',
    name: 'Миниатюрная диорама',
    category: '3d',
    niche: 'История, города, войны',
    swatch: '#C9D9A6',
    ink: '#1F1D1A',
    prompt:
      'Tilt-shift miniature diorama, tiny detailed 3D figures and buildings, shallow depth of field, soft daylight, toy-like scale. ' +
      NO_TEXT,
    characterHint: 'a tiny detailed miniature figurine'
  },
  {
    id: 'cinematic',
    name: 'Реалистичное кино',
    category: 'realistis',
    niche: 'Мистика, история, драма',
    swatch: '#56607A',
    ink: '#FAF7F2',
    prompt:
      'Photorealistic cinematic film still, dramatic natural lighting, shallow depth of field, anamorphic lens look, rich color grading, subtle 35mm film grain. ' +
      NO_TEXT,
    characterHint: 'a photorealistic person, cinematic lighting'
  },
  {
    id: 'documentary',
    name: 'Документальное фото',
    category: 'realistis',
    niche: 'Факты, новости, природа',
    swatch: '#8A9A7B',
    ink: '#FAF7F2',
    prompt:
      'Realistic documentary photograph, natural light, authentic details, candid composition, high detail, true-to-life colors. ' +
      NO_TEXT,
    characterHint: 'a realistic documentary portrait of a person'
  },
  {
    id: 'archival',
    name: 'Архивное фото',
    category: 'realistis',
    niche: 'История, войны, личности',
    swatch: '#B9A488',
    ink: '#1F1D1A',
    prompt:
      'Vintage archival photograph, faded sepia or black and white, film grain, light scratches and dust, historical documentary look. ' +
      NO_TEXT,
    characterHint: 'a person in a vintage archival sepia photograph'
  },
  {
    id: 'epic',
    name: 'Эпическое фэнтези',
    category: 'realistis',
    niche: 'Мифы, легенды',
    swatch: '#6C5B8E',
    ink: '#FAF7F2',
    prompt:
      'Epic realistic fantasy concept art, highly detailed, volumetric light, grand scale, painterly realism, cinematic composition. ' +
      NO_TEXT,
    characterHint: 'an epic realistic fantasy character, concept art'
  }
]

export function getStyle(id: string): VisualStyle {
  return VISUAL_STYLES.find((s) => s.id === id) ?? VISUAL_STYLES[0]
}
