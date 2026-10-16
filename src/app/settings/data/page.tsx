import { LocaleProvider, UiText } from "@/components/locale/LocaleProvider";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { DataLifecyclePanel } from "@/components/settings/DataLifecyclePanel";
export const metadata = { title: "Data location and lifecycle" };
export default async function DataLifecycleSettingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return <LocaleProvider><main className="mx-auto w-full max-w-5xl min-w-0 space-y-4 p-3 sm:p-6"><Link className="inline-block rounded-xl border bg-white px-4 py-2 print:hidden" href={dashboardPathForRole(user.role)}><UiText>Dashboard</UiText></Link><DataLifecyclePanel userId={user.userId} /></main></LocaleProvider>;
}
