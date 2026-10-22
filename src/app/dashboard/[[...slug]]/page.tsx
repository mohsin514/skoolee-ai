import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { loadPermissionMap } from "@/lib/permissions";
import { capabilitiesFor } from "@/lib/navigation/capabilities";
import { legacyDashboardTarget } from "@/lib/navigation/legacy-redirects";

export const dynamic = "force-dynamic";

/**
 * SPEC §6.1 — the legacy `/dashboard/**` console is retired. Every bookmark, notification and email link
 * that still points here lands on the caller's own console view; the decision is the pure
 * `legacyDashboardTarget` (unit-tested). Nothing renders: the page only redirects.
 */
export default async function LegacyDashboard({ params, searchParams }: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageSession();
  const [{ slug = [] }, query] = await Promise.all([params, searchParams]);
  const caps = await capabilitiesFor(user, await loadPermissionMap(user.schoolId, user.role));
  redirect(legacyDashboardTarget({ role: user.role, academicLead: caps.academicLead, standaloneOwner: caps.standaloneOwner }, slug, query)); // outside try/catch
}
