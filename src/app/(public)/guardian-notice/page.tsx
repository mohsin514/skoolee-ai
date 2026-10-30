import { LegalDocPage, legalDocMetadata } from "../legal-doc-page";

export const metadata = legalDocMetadata("guardian", "/guardian-notice");

export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  return <LegalDocPage id="guardian" path="/guardian-notice" searchParams={searchParams} />;
}
