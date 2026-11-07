/**
 * What the app can run on this computer, as packs: one ComfyUI graph (workflow) and the model files it loads.
 * The app reads each graph to see which files and nodes it needs and asks ComfyUI which of them it has. Packs with
 * `files` can also be downloaded from the app: those files' sources are known (Comfy-Org and FastVideo on Hugging Face).
 */

export type ModelGroup = 'image' | 'video' | 'talk' | 'music'

export interface PackFile {
  name: string
  /** ComfyUI models subfolder the file goes to. */
  folder: 'diffusion_models' | 'text_encoders' | 'vae' | 'checkpoints' | 'loras'
  url: string
  bytes: number
}

export interface PackDef {
  id: string
  name: string
  group: ModelGroup
  /** What the pack is for in the app, one line. */
  use: string
  /** Its strong points, one line. */
  pros: string
  /** When to pick it and how to get the best out of it, one line. */
  howTo: string
  workflow: string
  files?: PackFile[]
  /** Why this pack is the one to have for its job; set on the recommended pack of each group. */
  recommended?: string
}

const HF = 'https://huggingface.co/Comfy-Org'
const QWEN21 = `${HF}/Qwen-Image-2.1/resolve/main`
const H3 = `${HF}/MiniMax-H3/resolve/main`

export const MODEL_GROUPS: { id: ModelGroup; label: string }[] = [
  { id: 'image', label: 'Кадры и обложки' },
  { id: 'video', label: 'Видео' },
  { id: 'talk', label: 'Говорящая голова' },
  { id: 'music', label: 'Фоновая музыка' }
]

export const MODEL_PACKS: PackDef[] = [
  // ---------- pictures ----------
  {
    id: 'z-image',
    name: 'Z-Image Turbo',
    group: 'image',
    use: 'Кадры раскадровки и обложки — быстро.',
    pros: 'Кадр за 10–20 секунд, мало видеопамяти, хорошая фотореалистичность.',
    howTo: 'Модель по умолчанию для раскадровки: быстро перебрать варианты сцен. Для надписей в кадре лучше Qwen-Image.',
    workflow: 'image-z-image-turbo.json',
    recommended: 'Кадр за 10–20 секунд, хватает для раскадровки и обложек.'
  },
  {
    id: 'qwen-edit',
    name: 'Qwen-Image 2.1 Edit',
    group: 'image',
    use: 'Карта персонажа по портрету, обложка по кадру проекта.',
    pros: 'Меняет картинку по словам и сохраняет лицо человека с фото.',
    howTo: 'Нужна для «Сделать карту из портрета», карт из видео и обложек — приложение вызывает её само.',
    workflow: 'image-qwen21-edit.json',
    recommended: 'Нужна для карт персонажей из фото и обложек по кадрам.'
  },
  {
    id: 'qwen-image',
    name: 'Qwen-Image 2.1',
    group: 'image',
    use: 'Кадры с точными деталями и надписями.',
    pros: 'Лучше всех пишет текст в кадре, в том числе по-русски, и точно следует длинному описанию.',
    howTo: 'Для кадров с вывесками, экранами и сложными сценами. Медленнее Z-Image — включайте, когда важна точность.',
    workflow: 'image-qwen-image-2.1.json'
  },
  {
    id: 'qwen-turbo',
    name: 'Qwen-Image 2.1 Turbo',
    group: 'image',
    use: 'Качество Qwen-Image за 8 шагов.',
    pros: 'Те же надписи и точность, что у Qwen-Image 2.1, но в 3–4 раза быстрее. Докачать нужно только 7 ГБ.',
    howTo: 'Ставьте, если Qwen-Image 2.1 нравится, но долго ждать. Хороша для кадров с текстом и для обложек.',
    workflow: 'image-qwen21-turbo.json',
    files: [
      { name: 'qwen_image_2.1_turbo_int8_convrot.safetensors', folder: 'diffusion_models', url: `${QWEN21}/diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors`, bytes: 7256787829 },
      { name: 'qwen3vl_8b_int8_convrot.safetensors', folder: 'text_encoders', url: `${QWEN21}/text_encoders/qwen3vl_8b_int8_convrot.safetensors`, bytes: 9350798360 },
      { name: 'qwen_image_2.1_vae_bf16.safetensors', folder: 'vae', url: `${QWEN21}/vae/qwen_image_2.1_vae_bf16.safetensors`, bytes: 675509688 }
    ]
  },
  {
    id: 'krea2',
    name: 'Krea-2 Turbo',
    group: 'image',
    use: 'Красивые, «журнальные» кадры за 8 шагов.',
    pros: 'Сильная эстетика: свет, цвет и композиция как у фотографа, живые лица.',
    howTo: 'Для обложек, рекламных кадров и имиджевых сцен, где важна красота картинки, а не надписи.',
    workflow: 'image-krea2-turbo.json',
    files: [
      { name: 'krea2_turbo_int8_convrot.safetensors', folder: 'diffusion_models', url: `${HF}/Krea-2/resolve/main/diffusion_models/krea2_turbo_int8_convrot.safetensors`, bytes: 13492686496 },
      { name: 'qwen3vl_4b_fp8_scaled.safetensors', folder: 'text_encoders', url: `${HF}/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors`, bytes: 5242467968 },
      { name: 'qwen_image_vae.safetensors', folder: 'vae', url: `${HF}/Krea-2/resolve/main/vae/qwen_image_vae.safetensors`, bytes: 253806246 }
    ]
  },
  // ---------- video ----------
  {
    id: 'h3-ref2v',
    name: 'MiniMax H3 (кадр + лица)',
    group: 'video',
    use: 'Видео с узнаваемыми лицами персонажей.',
    pros: 'Держит лица по картам персонажей, естественное движение и звуки сцены.',
    howTo: 'Главная модель для серий с одними героями: у персонажей должны быть карты. Около 5 минут на клип.',
    workflow: 'video-h3-reference-to-video.json',
    recommended: 'Держит лица персонажей по их картам — главное для серий с одними героями.'
  },
  {
    id: 'ltx25',
    name: 'LTX 2.5',
    group: 'video',
    use: 'Видео из кадра со звуком — быстрее всех.',
    pros: 'Около 3 минут на клип, звуки окружения сразу в видео.',
    howTo: 'Для общих планов, природы, городов и сцен без крупных лиц — там, где скорость важнее точности лица.',
    workflow: 'video-ltx25-image-to-video.json'
  },
  {
    id: 'h3-i2v',
    name: 'MiniMax H3 (из кадра)',
    group: 'video',
    use: 'Видео из кадра, живое движение и речь.',
    pros: 'Очень живое движение людей, мимика и звук сцены.',
    howTo: 'Для сцен с действием, когда персонажам не нужны карты. Лицо берётся из самого кадра.',
    workflow: 'video-h3-image-to-video.json'
  },
  {
    id: 'fasth3',
    name: 'FastH3 (MiniMax H3 за 8 шагов)',
    group: 'video',
    use: 'Быстрая версия MiniMax H3: видео из кадра со звуком.',
    pros: 'Движение и звук как у MiniMax H3, но 8 шагов и разреженное внимание — в несколько раз быстрее.',
    howTo: 'Для черновой сборки всего ролика и для сцен, которые часто переделываете. Лица не держит — для героев с картами берите H3 с лицами.',
    workflow: 'video-fasth3-i2v.json',
    files: [
      { name: 'fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors', folder: 'diffusion_models', url: 'https://huggingface.co/FastVideo/FastVideo-FastH3-Comfy/resolve/main/diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors', bytes: 22128378696 },
      { name: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors', folder: 'text_encoders', url: `${H3}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`, bytes: 15687142551 },
      { name: 'minimax_h3_video_vae_int8_convrot.safetensors', folder: 'vae', url: `${H3}/vae/minimax_h3_video_vae_int8_convrot.safetensors`, bytes: 2811065184 },
      { name: 'minimax_h3_audio_vae_fp32.safetensors', folder: 'vae', url: `${H3}/vae/minimax_h3_audio_vae_fp32.safetensors`, bytes: 605254808 }
    ]
  },
  {
    id: 'wan22-5b',
    name: 'Wan 2.2 5B',
    group: 'video',
    use: 'Лёгкое видео из кадра для слабых видеокарт.',
    pros: 'Небольшая модель: 720p, плавная камера, меньше видеопамяти, чем H3 и LTX. Без звука.',
    howTo: 'Для фоновых сцен и B-roll на компьютере без мощной видеокарты. До 5 секунд на клип; звук — из музыки и голоса.',
    workflow: 'video-wan22-5b-i2v.json',
    files: [
      { name: 'wan2.2_ti2v_5B_fp16.safetensors', folder: 'diffusion_models', url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors`, bytes: 9999658848 },
      { name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', folder: 'text_encoders', url: `${HF}/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`, bytes: 6735906897 },
      { name: 'wan2.2_vae.safetensors', folder: 'vae', url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors`, bytes: 1409400960 }
    ]
  },
  // ---------- talking head ----------
  {
    id: 'infinitetalk',
    name: 'InfiniteTalk',
    group: 'talk',
    use: 'Говорящая голова по фото и готовому голосу — для реальных людей.',
    pros: 'Губы точно в такт голосу, лицо с фото не меняется, клип любой длины.',
    howTo: 'Для сцен, где человек говорит в камеру: возьмите настоящее фото («Свой кадр») и голос клипа. Около 10 минут на клип.',
    workflow: 'video-infinitetalk-i2v.json',
    recommended: 'Единственная, которой можно доверить реального человека, говорящего в камеру.'
  },
  // ---------- music ----------
  {
    id: 'ace-step',
    name: 'ACE-Step 1.5 XL Turbo',
    group: 'music',
    use: 'Фоновая музыка по стилю проекта: 8 шагов, около минуты на трек.',
    pros: 'Быстро и бесплатно, хорошо понимает жанр, темп и тональность из тегов стиля.',
    howTo: 'Музыка под закадровый голос для любого ролика. Задайте стиль тегами («upbeat pop, 120 BPM, piano») в промпте музыки.',
    workflow: 'music-ace-step15.json',
    recommended: 'Быстрая и бесплатная фоновая музыка без интернета.',
    files: [
      { name: 'acestep_v1.5_xl_turbo_bf16.safetensors', folder: 'diffusion_models', url: `${HF}/ace_step_1.5_ComfyUI_files/resolve/main/split_files/diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors`, bytes: 9974719892 },
      { name: 'qwen_0.6b_ace15.safetensors', folder: 'text_encoders', url: `${HF}/ace_step_1.5_ComfyUI_files/resolve/main/split_files/text_encoders/qwen_0.6b_ace15.safetensors`, bytes: 1191588248 },
      { name: 'qwen_4b_ace15.safetensors', folder: 'text_encoders', url: `${HF}/ace_step_1.5_ComfyUI_files/resolve/main/split_files/text_encoders/qwen_4b_ace15.safetensors`, bytes: 8379154232 },
      { name: 'ace_1.5_vae.safetensors', folder: 'vae', url: `${HF}/ace_step_1.5_ComfyUI_files/resolve/main/split_files/vae/ace_1.5_vae.safetensors`, bytes: 337431732 }
    ]
  },
  {
    id: 'stable-audio-3',
    name: 'Stable Audio 3 Medium',
    group: 'music',
    use: 'Фоновая музыка и звуки по описанию: стерео, точная длина.',
    pros: 'Точно попадает в нужную длину, умеет и музыку, и звуковые эффекты, чистое стерео.',
    howTo: 'Для коротких роликов, подложек и атмосферных звуков. Опишите настроение и инструменты обычными словами.',
    workflow: 'music-stable-audio3.json',
    files: [
      { name: 'stable_audio_3_medium.safetensors', folder: 'checkpoints', url: `${HF}/stable-audio-3/resolve/main/checkpoints/stable_audio_3_medium.safetensors`, bytes: 9222116660 },
      { name: 't5gemma_b_b_ul2.safetensors', folder: 'text_encoders', url: `${HF}/stable-audio-3/resolve/main/text_encoders/t5gemma_b_b_ul2.safetensors`, bytes: 1187264003 }
    ]
  },
  {
    id: 'minimax-music-3',
    name: 'MiniMax Music 3',
    group: 'music',
    use: 'Полноценные треки до 5 минут со структурой.',
    pros: 'Целая композиция со вступлением, развитием и концовкой; может петь по тексту песни.',
    howTo: 'Для длинных роликов и когда нужна «настоящая» песня или гимн проекта. Медленнее ACE-Step: 30 шагов.',
    workflow: 'music-minimax-music3.json',
    files: [
      { name: 'minimax_music3_dit_fp16.safetensors', folder: 'diffusion_models', url: `${HF}/MiniMax-Music-3/resolve/main/diffusion_models/minimax_music3_dit_fp16.safetensors`, bytes: 4914197682 },
      { name: 'minimax_music3_text_encoder_pruned_int8_convrot.safetensors', folder: 'text_encoders', url: `${HF}/MiniMax-Music-3/resolve/main/text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors`, bytes: 9196611886 },
      { name: 'minimax_music3_dav.safetensors', folder: 'vae', url: `${HF}/MiniMax-Music-3/resolve/main/vae/minimax_music3_dav.safetensors`, bytes: 216696128 }
    ]
  }
]

/** Ollama models worth having: the script writer and the vision model that studies a person's video. */
export const OLLAMA_SUGGESTED: { name: string; note: string }[] = [
  { name: 'gemma3:27b', note: 'Сценарий, промпты и разбор видео с персонажем. Около 17 ГБ, нужна видеокарта на 24 ГБ.' },
  { name: 'gemma3:12b', note: 'То же, но легче: около 8 ГБ, для видеокарты на 12–16 ГБ.' }
]

/** The pack behind each local model of the app's lists (shared/higgsfield.ts LOCAL_MODELS). */
export const PACK_OF_MODEL: Record<string, string> = {
  'local/z-image-turbo': 'z-image',
  'local/qwen-image-2.1': 'qwen-image',
  'local/qwen-image-2.1-turbo': 'qwen-turbo',
  'local/krea2-turbo': 'krea2',
  'local/ltx25-i2v': 'ltx25',
  'local/h3-i2v': 'h3-i2v',
  'local/h3-ref2v': 'h3-ref2v',
  'local/fasth3-i2v': 'fasth3',
  'local/wan22-5b-i2v': 'wan22-5b',
  'local/infinitetalk': 'infinitetalk'
}

export const gb = (bytes: number): string => `${(bytes / 1e9).toLocaleString('ru-RU', { maximumFractionDigits: bytes < 1e10 ? 1 : 0 })} ГБ`
