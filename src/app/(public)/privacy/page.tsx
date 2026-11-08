import { LegalDocPage, legalDocMetadata } from "../legal-doc-page";

export const metadata = legalDocMetadata("privacy", "/privacy");

export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  return <LegalDocPage id="privacy" path="/privacy" searchParams={searchParams} />;
}
