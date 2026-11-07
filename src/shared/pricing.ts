/**
 * Paid-tier prices of the Google models the app calls, from the Gemini API pricing page (read 2026-11-08,
 * https://ai.google.dev/gemini-api/docs/pricing). Gemini 3.8 prices double on 2027-01-01. Per 1M tokens in USD;
 * Lyria is per song. Other services report their own cost (OpenRouter, Higgsfield) or are counted in their units.
 */

interface TokenPrice {
  in: number
  out: number
  /** Prices from a date on (ISO date). */
  later?: { from: string; in: number; out: number }
}

const TOKEN_PRICES: Record<string, TokenPrice> = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75, later: { from: '2027-01-01', in: 1.5, out: 7.5 } },
  'gemini-3.8-flash-tts': { in: 0.5, out: 9, later: { from: '2027-01-01', in: 1, out: 18 } },
  'gemini-3.8-flash-lite-tts': { in: 0.5, out: 6, later: { from: '2027-01-01', in: 1, out: 12 } }
}

export const SONG_PRICES: Record<string, number> = {
  'lyria-3-clip-preview': 0.04,
  'lyria-3-pro-preview': 0.08,
  'lyria-3.5': 0.08
}

/** Cost in USD of a Gemini call, or null when the model's price is not known. */
export function tokenCost(model: string, inputTokens: number, outputTokens: number, at = Date.now()): number | null {
  const p = TOKEN_PRICES[model.replace(/^models\//, '')]
  if (!p) return null
  const rate = p.later && at >= Date.parse(p.later.from) ? p.later : p
  return (inputTokens * rate.in + outputTokens * rate.out) / 1e6
}
