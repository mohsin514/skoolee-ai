import type { Metadata } from "next";
import { TrustPage } from "./trust-page";
import {
  TRUST_PACK_CHROME, TRUST_PACK_VERSION, trustPackDoc, trustPackLang, type TrustPackId,
} from "@/lib/legal/trust-pack";

type SearchParams = Promise<{ lang?: string | string[] }>;

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

export async function LegalDocPage({ id, path, searchParams }: { id: TrustPackId; path: string; searchParams: SearchParams }) {
  const lang = trustPackLang((await searchParams).lang);
  const chrome = TRUST_PACK_CHROME[lang];
  return (
    <TrustPage
      copy={{
        ...trustPackDoc(id, lang),
        currentHref: path,
        legal: {
          lang,
          draft: chrome.draft,
          version: `${chrome.version} ${TRUST_PACK_VERSION}`,
          switchHref: lang === "ur" ? path : `${path}?lang=ur`,
          switchLabel: chrome.switchLabel,
        },
      }}
    />
  );
}
