import { LegalDocPage, legalDocMetadata } from "../legal-doc-page";

export const metadata = legalDocMetadata("dpa", "/dpa");

export default function Page({ searchParams }: { searchParams: Promise<{ lang?: string | string[] }> }) {
  return <LegalDocPage id="dpa" path="/dpa" searchParams={searchParams} />;
}
