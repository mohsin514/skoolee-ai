import type { Metadata } from "next";
import { TrustPage } from "./trust-page";
import { readPublicLanguage, type LangSearchParams } from "./public-lang";
import { trustInfoDoc, type TrustInfoId } from "@/lib/legal/public-locale";

/** SKAI-1002: /security, /ai-governance and /human-review-policy in EN/AR/UR. */
export async function infoMetadata(id: TrustInfoId, searchParams: LangSearchParams): Promise<Metadata> {
  const { lang } = await readPublicLanguage(searchParams);
  const doc = trustInfoDoc(id, lang);
  return { title: doc.metaTitle, description: doc.metaDescription, alternates: { canonical: `https://app.skooleeai.com/${id}` } };
}

export async function InfoPage({ id, searchParams }: { id: TrustInfoId; searchParams: LangSearchParams }) {
  const { lang, carry } = await readPublicLanguage(searchParams);
  const { title, description, sections } = trustInfoDoc(id, lang);
  return <TrustPage lang={lang} carry={carry} copy={{ title, description, sections, currentHref: `/${id}` }} />;
}
