import { LANGUAGES, type Language } from "./package";

/**
 * Pre-login display language. Non-HttpOnly on purpose: it is a non-sensitive
 * UI preference the login page writes the moment the selector changes. Any
 * value other than the three literals is treated as absent, so a tampered
 * cookie never reaches HTML attributes or the database.
 *
 * Isomorphic: no `next/headers` import, safe in client and server code.
 */
export const LANGUAGE_COOKIE = "skoolee-lang";
/** sessionStorage key: "1" when the language was chosen in this tab. */
export const EXPLICIT_LANGUAGE_KEY = "skoolee-lang-explicit";
const MAX_AGE = 31_536_000;

export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = { en: "English", ar: "العربية", ur: "اردو" };

export function parseLanguage(value: unknown): Language | null {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value) ? (value as Language) : null;
}

export const directionFor = (lang: Language): "ltr" | "rtl" => (lang === "en" ? "ltr" : "rtl");

function isSecure() {
  if (typeof window !== "undefined") return window.location.protocol === "https:";
  return process.env.NODE_ENV === "production";
}

export function languageCookieAttributes(): { path: "/"; sameSite: "lax"; secure: boolean; httpOnly: false; maxAge: 31_536_000 } {
  return { path: "/", sameSite: "lax", secure: isSecure(), httpOnly: false, maxAge: MAX_AGE };
}

/** The `document.cookie` string for `lang`. Exported for tests. */
export function serializeLanguageCookie(lang: Language, secure = isSecure()): string {
  return `${LANGUAGE_COOKIE}=${lang}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Reads `skoolee-lang` out of a raw `Cookie` header / `document.cookie` string. */
export function parseLanguageCookie(cookieString: string): Language | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANGUAGE_COOKIE) return parseLanguage(rest.join("="));
  }
  return null;
}

export function writeLanguageCookieClient(lang: Language): void {
  const value = parseLanguage(lang);
  if (!value) return;
  document.cookie = serializeLanguageCookie(value);
}

export function readLanguageCookieClient(): Language | null {
  if (typeof document === "undefined") return null;
  return parseLanguageCookie(document.cookie);
}
