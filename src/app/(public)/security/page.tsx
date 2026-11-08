import { InfoPage, infoMetadata } from "../info-page";
import type { LangSearchParams } from "../public-lang";

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => infoMetadata("security", searchParams);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <InfoPage id="security" searchParams={searchParams} />;
}
