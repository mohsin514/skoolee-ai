import { redirect } from "next/navigation";
import { LocaleProvider } from "@/components/locale/LocaleProvider";
import { ReadinessHome } from "@/components/readiness/ReadinessHome";
import { getAuthUser } from "@/lib/auth";

export const metadata = { title: "School readiness" };

export default async function SchoolReadinessPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return <LocaleProvider><ReadinessHome /></LocaleProvider>;
}
