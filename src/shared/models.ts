import type { LlmProvider } from './types'

export const LLM_PROVIDERS: { id: LlmProvider; name: string; note: string; link: string | null; linkLabel: string }[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    note: 'Этот же ключ работает для голоса рассказчика Gemini TTS.',
    link: 'https://aistudio.google.com/apikey',
    linkLabel: 'Создать ключ в Google AI Studio'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    note: 'Один ключ к сотням моделей от разных провайдеров, есть и бесплатные.',
    link: 'https://openrouter.ai/settings/keys',
    linkLabel: 'Создать ключ в OpenRouter'
  },
  {
    id: 'groq',
    name: 'Groq',
    note: 'Очень быстрые открытые модели: Llama, Qwen, GPT-OSS и другие.',
    link: 'https://console.groq.com/keys',
    linkLabel: 'Создать ключ в консоли Groq'
  },
  {
    id: 'custom',
    name: 'Свой сервер',
    note: 'Любой сервер, совместимый с OpenAI API: Ollama, LM Studio, vLLM, DeepSeek, xAI Grok и другие.',
    link: null,
    linkLabel: ''
  }
]

export function llmName(id: LlmProvider): string {
  return LLM_PROVIDERS.find((p) => p.id === id)?.name ?? id
}

/** Higgsfield image and video models live in ./higgsfield.ts, generated from the API docs. */

/**
 * Gemini 3.8 TTS Voice Library voices that ship with a sample in the app (assets/voices/<id>.mp3). Used
 * when the live voice list cannot be fetched; the tone comes from each sample's persona.
 */
export const GEMINI_LIBRARY_VOICES: { id: string; name: string; tone: string }[] = [
  { id: 'en-us-arlo', name: 'Arlo', tone: 'личный ассистент' },
  { id: 'en-us-bodi', name: 'Bodi', tone: 'преподаватель литературы' },
  { id: 'en-us-brio', name: 'Brio', tone: 'ведущий бизнес-новостей' },
  { id: 'en-us-cruz', name: 'Cruz', tone: 'финансовый советник' },
  { id: 'en-us-daro', name: 'Daro', tone: 'поддержка клиентов, сочувственный' },
  { id: 'en-us-elio', name: 'Elio', tone: 'строгий, официальный' },
  { id: 'en-us-enya', name: 'Enya', tone: 'технический гид' },
  { id: 'en-us-enzo', name: 'Enzo', tone: 'рассказчик приключений' },
  { id: 'en-us-finn', name: 'Finn', tone: 'личный ассистент' },
  { id: 'en-us-fola', name: 'Fola', tone: 'поддержка клиентов' },
  { id: 'en-us-gero', name: 'Gero', tone: 'тёплый, успокаивающий' },
  { id: 'en-us-hali', name: 'Hali', tone: 'поддержка клиентов' },
  { id: 'en-us-jett', name: 'Jett', tone: 'технический гид' },
  { id: 'en-us-lora', name: 'Lora', tone: 'элегантный консьерж' },
  { id: 'en-us-ludo', name: 'Ludo', tone: 'преподаватель технологий' },
  { id: 'en-us-lumi', name: 'Lumi', tone: 'преподаватель литературы' },
  { id: 'en-us-mako', name: 'Mako', tone: 'презентация продукта' },
  { id: 'en-us-neno', name: 'Neno', tone: 'мягкий, внимательный' },
  { id: 'en-us-nika', name: 'Nika', tone: 'мягкий, внимательный' },
  { id: 'en-us-nyla', name: 'Nyla', tone: 'технический гид' },
  { id: 'en-us-rami', name: 'Rami', tone: 'диктор новостей' },
  { id: 'en-us-riko', name: 'Riko', tone: 'рассказчик фэнтези' },
  { id: 'en-us-rina', name: 'Rina', tone: 'тёплый, успокаивающий' },
  { id: 'en-us-tari', name: 'Tari', tone: 'спокойный, умиротворяющий' },
  { id: 'en-us-tavi', name: 'Tavi', tone: 'элегантный консьерж' },
  { id: 'en-us-tova', name: 'Tova', tone: 'строгий, официальный' },
  { id: 'en-us-varo', name: 'Varo', tone: 'преподаватель математики' },
  { id: 'en-us-veda', name: 'Veda', tone: 'диктор новостей' },
  { id: 'en-us-zali', name: 'Zali', tone: 'драматичный, мрачное фэнтези' },
  { id: 'en-us-zeno', name: 'Zeno', tone: 'ведущий' }
]

/** Tone of any Gemini voice we know, by id. */
export function geminiVoiceTone(id: string): string | undefined {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.tone ?? GEMINI_VOICES.find((v) => v.id === id)?.tone
}

export function geminiVoiceName(id: string): string {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.name ?? id
}

/** The 30 classic prebuilt voices. */
export const GEMINI_VOICES: { id: string; tone: string }[] = [
  { id: 'Charon', tone: 'информативный' },
  { id: 'Kore', tone: 'уверенный' },
  { id: 'Puck', tone: 'весёлый' },
  { id: 'Zephyr', tone: 'бодрый' },
  { id: 'Fenrir', tone: 'энергичный' },
  { id: 'Leda', tone: 'молодой' },
  { id: 'Orus', tone: 'уверенный' },
  { id: 'Aoede', tone: 'непринуждённый' },
  { id: 'Callirrhoe', tone: 'непринуждённый' },
  { id: 'Autonoe', tone: 'бодрый' },
  { id: 'Enceladus', tone: 'шёпот' },
  { id: 'Iapetus', tone: 'чистый' },
  { id: 'Umbriel', tone: 'непринуждённый' },
  { id: 'Algieba', tone: 'плавный' },
  { id: 'Despina', tone: 'плавный' },
  { id: 'Erinome', tone: 'чистый' },
  { id: 'Algenib', tone: 'с хрипотцой' },
  { id: 'Rasalgethi', tone: 'информативный' },
  { id: 'Laomedeia', tone: 'весёлый' },
  { id: 'Achernar', tone: 'мягкий' },
  { id: 'Alnilam', tone: 'уверенный' },
  { id: 'Schedar', tone: 'ровный' },
  { id: 'Gacrux', tone: 'зрелый' },
  { id: 'Pulcherrima', tone: 'прямой' },
  { id: 'Achird', tone: 'дружелюбный' },
  { id: 'Zubenelgenubi', tone: 'повседневный' },
  { id: 'Vindemiatrix', tone: 'мягкий' },
  { id: 'Sadachbia', tone: 'живой' },
  { id: 'Sadaltager', tone: 'вдумчивый' },
  { id: 'Sulafat', tone: 'тёплый' }
]

export const LANGUAGES: { code: string; label: string; english: string }[] = [
  { code: 'ru', label: 'Русский', english: 'Russian' },
  { code: 'id', label: 'Indonesia', english: 'Indonesian' },
  { code: 'en', label: 'English', english: 'English' },
  { code: 'ms', label: 'Melayu', english: 'Malay' },
  { code: 'jv', label: 'Jawa', english: 'Javanese' },
  { code: 'su', label: 'Sunda', english: 'Sundanese' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'ar', label: 'العربية', english: 'Arabic' }
]

export const DURATIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30 секунд' },
  { sec: 60, label: '1 минута' },
  { sec: 180, label: '3 минуты' },
  { sec: 300, label: '5 минут' },
  { sec: 600, label: '10 минут' }
]

/** Roughly one clip every ~5.5 seconds of narration. */
export function clipCountFor(durationSec: number): number {
  return Math.max(3, Math.min(120, Math.round(durationSec / 5.5)))
}
