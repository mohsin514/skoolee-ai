import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { ROLE_NAV, consoleForRole } from "@/lib/navigation/role-nav";
import { SearchWorkspace } from "@/components/search/search-workspace";

export const dynamic = "force-dynamic";

/**
 * SKO-401: one record search for school staff; results open the record's own workspace. Only the consoles that
 * offer "Search records" (registry `recordSearch`: campus/school admin, principal, reception — the same roles as the
 * `recordSearch` capability) open it; everyone else goes home instead of meeting an access notice (SPEC §6.3).
 */
export default async function SearchPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!ROLE_NAV[consoleForRole(user.role)]?.recordSearch) redirect(dashboardPathForRole(user.role));
  // Framed: the sidebar is the way back, so the workspace takes no dashboard link.
  return <Suspense><SearchWorkspace /></Suspense>;
}
