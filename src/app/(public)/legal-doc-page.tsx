import type { Metadata } from "next";
import { TrustPage } from "./trust-page";
import { readPublicLanguage, type LangSearchParams } from "./public-lang";
import {
  TRUST_PACK_CHROME, TRUST_PACK_VERSION, trustPackDoc, trustPackLang, type TrustPackId,
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
  const { lang: wanted, carry } = await readPublicLanguage(searchParams);
  // The Arabic trust-pack documents land in a follow-up SKAI-1002 slice; until
  // then an Arabic visitor gets the English draft, laid out left-to-right.
  const lang = trustPackLang(wanted);
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
