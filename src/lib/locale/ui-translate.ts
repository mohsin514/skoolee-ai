// SKAI-1004: the EN/AR/UR UI catalog is ~875 KB gzip. Client code translates
// through this light module so English pages never download it; the catalog is
// fetched on demand the first time Arabic or Urdu is needed. Locale providers
// gate rendering on it (see UiCatalogGate), so AR/UR text is never replaced by
// English during hydration. Server-only code may keep importing ui-messages.
//
// The pre-login (auth) pages ask for the "auth" scope instead: a generated
// per-language subset (~6 KB gzip) holding every catalog entry their client
// code can reach (scripts/gen-auth-ui-catalog.ts, checked by a test). The
// full catalog still loads the first time anything asks for the "full" scope.
type Lang = "en" | "ar" | "ur";
type Translate = (source: string, language: Lang) => string;
export type UiCatalogScope = "full" | "auth";

let full: Translate | undefined;
let pending: Promise<void> | undefined;
const auth: Partial<Record<"ar" | "ur", Record<string, string>>> = {};
const authPending: Partial<Record<"ar" | "ur", Promise<void>>> = {};

function loadAuth(language: "ar" | "ur"): Promise<void> {
  authPending[language] ??= (language === "ar" ? import("./auth-ui-catalog.ar") : import("./auth-ui-catalog.ur"))
    .then((m) => { auth[language] = m.default; });
  return authPending[language];
}

/** Resolves once the catalog for `scope` is available. English never loads anything. */
export function loadUiCatalog(language: Lang, scope: UiCatalogScope = "full"): Promise<void> {
  if (language === "en" || full) return Promise.resolve();
  if (scope === "auth") return auth[language] ? Promise.resolve() : loadAuth(language);
  pending ??= import("./ui-messages").then((m) => { full = m.translateUi; });
  return pending;
}

export function isUiCatalogReady(language: Lang, scope: UiCatalogScope = "full"): boolean {
  return language === "en" || Boolean(full) || (scope === "auth" && Boolean(auth[language]));
}

/** Same contract as ui-messages `translateUi`; returns the source until a catalog has loaded. */
export function translateUi(source: string, language: Lang): string {
  if (language === "en") return source;
  if (full) return full(source, language);
  const subset = auth[language];
  if (subset) return subset[source] ?? source;
  void loadUiCatalog(language);
  return source;
}
