// SKAI-1002: public trust pages follow the visitor's language. An explicit
// `?lang=` wins, then the pre-login `skoolee-lang` cookie, then English.
// Isomorphic and pure so it can be unit-tested; pages pass in the cookie value.
// AR/UR copy is machine-quality and needs native/legal review (SKAI-1086, SKAI-1087).
import { parseLanguage } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";
import { TRUST_CHROME, type TrustChrome } from "./locales/trust-chrome";
import { TRUST_INFO, type TrustInfoDoc, type TrustInfoId } from "./locales/trust-info";

export type { TrustChrome, TrustInfoId };

export function publicLanguage(param: string | string[] | undefined, cookie: string | undefined): Language {
  return parseLanguage(param) ?? parseLanguage(cookie) ?? "en";
}

export function trustChrome(lang: Language): TrustChrome {
  return TRUST_CHROME[lang];
}

export function trustInfoDoc(id: TrustInfoId, lang: Language): TrustInfoDoc {
  return TRUST_INFO[lang][id];
}

/** Adds `?lang=` only when the visitor chose a language explicitly in the URL. */
export function langHref(path: string, lang: Language | null): string {
  return lang ? `${path}?lang=${lang}` : path;
}
