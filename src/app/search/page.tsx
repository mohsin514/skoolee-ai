import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { dashboardPathForRole } from "@/lib/roles";
import { SearchWorkspace } from "@/components/search/search-workspace";

export const dynamic = "force-dynamic";

/** SKO-401: one record search for school staff; results open the record's own workspace. */
export default async function SearchPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (user.role === "APP_OWNER") redirect("/owner");
  if (user.role === "PARENT" || user.role === "STUDENT") redirect(dashboardPathForRole(user.role));
  return <Suspense><SearchWorkspace dashboardHref={dashboardPathForRole(user.role)} /></Suspense>;
}
