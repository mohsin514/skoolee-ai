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

/**
 * Retrieval tokens: like `tokens`, with light Arabic-script stemming so "الإعلان" finds "إعلان" and
 * the accusative "اختبارًا" finds "اختبار" (the live smoke showed both missing). Applied to both the
 * request and the capability copy, so matching stays symmetric. Evidence checks keep exact tokens.
 */
export function searchTokens(text: string): string[] {
  return tokens(text).map(token => {
    if (!/[\u0600-\u06FF]/.test(token)) return token;
    let stem = token;
    if (stem.length >= 5 && stem.startsWith("وال")) stem = stem.slice(3);
    else if (stem.length >= 4 && stem.startsWith("ال")) stem = stem.slice(2);
    if (stem.length >= 6 && stem.endsWith("ات")) stem = stem.slice(0, -2);
    else if (stem.length >= 5 && stem.endsWith("ا")) stem = stem.slice(0, -1);
    return stem;
  });
}

/** Letters Urdu uses and Arabic does not (incl. ہ ی ک) distinguish Urdu from Arabic script. */
export function detectScript(text: string): "ur" | "ar" | "en" {
  if (/[ٹڈڑںےھہیکگپچژ]/.test(text)) return "ur";
  if (/[؀-ۿ]/.test(text)) return "ar";
  return "en";
}
