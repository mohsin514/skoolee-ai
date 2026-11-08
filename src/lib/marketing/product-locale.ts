// SKAI-1002: marketing product pages in EN/AR/UR. The page language comes from
// `publicLanguage` (?lang, then the skoolee-lang cookie, then English).
import type { Language } from "@/lib/locale/package";
import { PRODUCT_EN } from "./locales/product-pages.en";
import { PRODUCT_AR } from "./locales/product-pages.ar";
import { PRODUCT_UR } from "./locales/product-pages.ur";

export const PRODUCT_PAGE_IDS = [
  "ai-school-management-software", "multi-campus-school-erp", "ai-report-cards-urdu-english",
  "ai-student-performance-analytics", "school-fee-management-software", "whatsapp-report-card-software",
] as const;
export type ProductPageId = typeof PRODUCT_PAGE_IDS[number];

export interface ProductPageText {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
  sections: { title: string; body: string }[];
  proof: string[];
}

export interface ProductChrome {
  navLabel: string; trust: string; pricing: string; login: string; demo: string; security: string;
  illustrative: string; synthetic: string; remarkTitle: string; remarkBody: string;
  stats: string[]; checks: string[]; ok: string; languageLabel: string;
}

export interface ProductLocale { chrome: ProductChrome; pages: Record<ProductPageId, ProductPageText> }

const BY_LANG: Record<Language, ProductLocale> = { en: PRODUCT_EN, ar: PRODUCT_AR, ur: PRODUCT_UR };

export function productLocale(lang: Language): ProductLocale {
  return BY_LANG[lang];
}
