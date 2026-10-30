// SKAI-1000 school trust pack: privacy policy, terms, DPA template and
// guardian notice in EN and UR. Every document is a DRAFT until counsel signs
// it off; the banner below is shown on every page and must stay until then.
import { TRUST_PACK_EN } from "./trust-pack.en";
import { TRUST_PACK_UR } from "./trust-pack.ur";

export type TrustPackId = "privacy" | "terms" | "dpa" | "guardian";
export type TrustPackLang = "en" | "ur";

export interface TrustPackDoc {
  title: string;
  description: string;
  sections: { title: string; body: string }[];
}

export const TRUST_PACK_VERSION = "0.1-draft (30 October 2026)";

export const TRUST_PACK_CHROME: Record<TrustPackLang, { draft: string; version: string; switchLabel: string }> = {
  en: { draft: "DRAFT — requires legal review. Not yet in force.", version: "Version", switchLabel: "اردو" },
  ur: { draft: "مسودہ — قانونی جائزہ ضروری ہے۔ ابھی نافذ نہیں۔ (DRAFT — requires legal review)", version: "ورژن", switchLabel: "English" },
};

export function trustPackLang(value: string | string[] | undefined): TrustPackLang {
  return value === "ur" ? "ur" : "en";
}

export function trustPackDoc(id: TrustPackId, lang: TrustPackLang): TrustPackDoc {
  return (lang === "ur" ? TRUST_PACK_UR : TRUST_PACK_EN)[id];
}
