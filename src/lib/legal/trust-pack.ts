// SKAI-1000 school trust pack: privacy policy, terms, DPA template and
// guardian notice in EN, AR and UR. Every document is a DRAFT until counsel signs
// it off; the banner below is shown on every page and must stay until then.
import { TRUST_PACK_EN } from "./trust-pack.en";
import { TRUST_PACK_UR } from "./trust-pack.ur";
import { TRUST_PACK_AR } from "./locales/trust-pack.ar";
import type { Language } from "@/lib/locale/package";

export type TrustPackId = "privacy" | "terms" | "dpa" | "guardian";
export type TrustPackLang = Language;

export interface TrustPackDoc {
  title: string;
  description: string;
  sections: { title: string; body: string }[];
}

export const TRUST_PACK_VERSION = "0.1-draft (30 October 2026)";

export const TRUST_PACK_CHROME: Record<TrustPackLang, { draft: string; version: string }> = {
  en: { draft: "DRAFT — requires legal review. Not yet in force.", version: "Version" },
  // SKAI-1002: machine-quality Arabic, native/legal review in SKAI-1086.
  ar: { draft: "مسودة — تتطلب مراجعة قانونية. غير سارية بعد. (DRAFT — requires legal review)", version: "الإصدار" },
  ur: { draft: "مسودہ — قانونی جائزہ ضروری ہے۔ ابھی نافذ نہیں۔ (DRAFT — requires legal review)", version: "ورژن" },
};

export function trustPackLang(value: string | string[] | undefined): TrustPackLang {
  return value === "ur" || value === "ar" ? value : "en";
}

export function trustPackDoc(id: TrustPackId, lang: TrustPackLang): TrustPackDoc {
  return { en: TRUST_PACK_EN, ar: TRUST_PACK_AR, ur: TRUST_PACK_UR }[lang][id];
}
