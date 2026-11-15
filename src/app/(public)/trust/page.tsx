import type { Metadata } from "next";
import { TrustPage } from "../trust-page";
import { readPublicLanguage, type LangSearchParams } from "../public-lang";
import { trustChrome } from "@/lib/legal/public-locale";
// SKAI-2160: the public trust hub. Static text from the trust chrome (EN/AR/UR); it lists every trust-pack page.
export const metadata: Metadata = { title: "Skoolee Trust", alternates: { canonical: "https://app.skooleeai.com/trust" } };
export default async function Page({ searchParams }: { searchParams: LangSearchParams }) {
  const { lang, carry } = await readPublicLanguage(searchParams);
  const t = trustChrome(lang);
  return <TrustPage lang={lang} carry={carry} copy={{ title: t.eyebrow, description: t.chips.join(" · "), sections: t.nav.map((n) => ({ title: n.label, body: n.desc })), currentHref: "/trust" }} />;
}
