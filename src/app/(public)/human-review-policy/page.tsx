import { InfoPage, infoMetadata } from "../info-page";
import type { LangSearchParams } from "../public-lang";

export const generateMetadata = ({ searchParams }: { searchParams: LangSearchParams }) => infoMetadata("human-review-policy", searchParams);

export default function Page({ searchParams }: { searchParams: LangSearchParams }) {
  return <InfoPage id="human-review-policy" searchParams={searchParams} />;
}
