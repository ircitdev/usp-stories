import { setUserFonts, type CaptionFont } from '@shared/captions'

/**
 * The user's own caption fonts in the renderer: known to getCaptionFont and loaded as web fonts
 * (studio://userfonts/<file>) so the preview draws them like the export.
 */
const loaded = new Set<string>()

export async function applyUserFonts(list: CaptionFont[] | undefined): Promise<void> {
  setUserFonts(list)
  for (const f of list ?? []) {
    if (loaded.has(f.file)) continue
    try {
      const face = new FontFace(f.family, `url("studio://userfonts/${encodeURIComponent(f.file)}")`)
      document.fonts.add(await face.load())
      loaded.add(f.file)
    } catch {
      // A broken file: the preview falls back to another font, the export still tries it.
    }
  }
}

export async function loadUserFonts(): Promise<void> {
  const s = await window.api.settings.get()
  await applyUserFonts(s.customFonts)
}
