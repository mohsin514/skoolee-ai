// SKAI-1004: the EN/AR/UR UI catalog is ~875 KB gzip. Client code translates
// through this light module so English pages never download it; the catalog is
// fetched on demand the first time Arabic or Urdu is needed. Locale providers
// gate rendering on it (see UiCatalogGate), so AR/UR text is never replaced by
// English during hydration. Server-only code may keep importing ui-messages.
type Lang = "en" | "ar" | "ur";
type Translate = (source: string, language: Lang) => string;

let full: Translate | undefined;
let pending: Promise<void> | undefined;

/** Resolves once the catalog is available. English never loads it. */
export function loadUiCatalog(language: Lang): Promise<void> {
  if (language === "en" || full) return Promise.resolve();
  pending ??= import("./ui-messages").then((m) => { full = m.translateUi; });
  return pending;
}

export function isUiCatalogReady(language: Lang): boolean {
  return language === "en" || Boolean(full);
}

/** Same contract as ui-messages `translateUi`; returns the source until the catalog has loaded. */
export function translateUi(source: string, language: Lang): string {
  if (language === "en") return source;
  if (full) return full(source, language);
  void loadUiCatalog(language);
  return source;
}
