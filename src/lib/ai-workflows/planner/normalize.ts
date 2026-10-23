/**
 * One normal form for EN/AR/UR text so evidence matching and retrieval agree across scripts:
 * NFKC + case-fold; Arabic/Urdu letter variants folded (ي ى ی → ی, ك ک → ک, ه ہ ة → ہ); tatweel,
 * diacritics and ZWNJ removed; Arabic-Indic and Urdu digits to ASCII; quotes unified; spaces collapsed.
 */
export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ‌‍]/g, "")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[هة]/g, "ہ").replace(/[أإآ]/g, "ا")
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 0xf))
    .replace(/[“”«»„]/g, "\"").replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ").trim();
}

/** Word tokens (letters or digits, any script) of normalised text. */
export function tokens(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Letters Urdu uses and Arabic does not (incl. ہ ی ک) distinguish Urdu from Arabic script. */
export function detectScript(text: string): "ur" | "ar" | "en" {
  if (/[ٹڈڑںےھہیکگپچژ]/.test(text)) return "ur";
  if (/[؀-ۿ]/.test(text)) return "ar";
  return "en";
}
