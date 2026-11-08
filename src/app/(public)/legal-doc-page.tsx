import type { Metadata } from "next";
import { TrustPage } from "./trust-page";
import { readPublicLanguage, type LangSearchParams } from "./public-lang";
import {
  TRUST_PACK_CHROME, TRUST_PACK_VERSION, trustPackDoc, type TrustPackId,
} from "@/lib/legal/trust-pack";

export function legalDocMetadata(id: TrustPackId, path: string): Metadata {
  const doc = trustPackDoc(id, "en");
  return {
    title: `${doc.title} (draft)`,
    description: doc.description,
    alternates: { canonical: `https://app.skooleeai.com${path}` },
    // Drafts stay out of search results until counsel signs them off.
    robots: { index: false, follow: true },
  };
}

export async function LegalDocPage({ id, path, searchParams }: { id: TrustPackId; path: string; searchParams: LangSearchParams }) {
  const { lang, carry } = await readPublicLanguage(searchParams);
  const chrome = TRUST_PACK_CHROME[lang];
  return (
    <TrustPage
      lang={lang}
      carry={carry}
      copy={{
        ...trustPackDoc(id, lang),
        currentHref: path,
        legal: { draft: chrome.draft, version: `${chrome.version} ${TRUST_PACK_VERSION}` },
      }}
    />
  );
}
