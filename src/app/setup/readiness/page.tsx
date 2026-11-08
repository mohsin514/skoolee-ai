import { ReadinessHome } from "@/components/readiness/ReadinessHome";

export const metadata = { title: "School readiness" };

/**
 * School readiness, framed in the caller's console. `setup/layout.tsx` already checks the session (families and the
 * platform operator go home) and provides the locale, so the page adds no second LocaleProvider of its own.
 */
export default function SchoolReadinessPage() {
  return <ReadinessHome />;
}
