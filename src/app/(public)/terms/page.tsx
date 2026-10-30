import { LegalDocPage, legalDocMetadata } from "../legal-doc-page";

export const metadata = legalDocMetadata("terms", "/terms");

export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  return <LegalDocPage id="terms" path="/terms" searchParams={searchParams} />;
}
