import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { isGroupConsole, isStandaloneOwner, isCampusOperator } from "@/lib/auth/institution";
import { dashboardPathForRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * SPEC §6.3 — `/memberships` is retired. Members and delegations live in the institution authority's
 * People & access view (`MembershipsPanel`); a campus admin with delegated member rights invites staff from
 * Staff & invites. Everyone else goes home. Nothing renders: the page only redirects.
 */
function membershipsTarget(user: Awaited<ReturnType<typeof requirePageSession>>): string {
  if (isGroupConsole(user)) return "/super?view=access&tab=members";
  if (isStandaloneOwner(user)) return "/admin?view=access&tab=members";
  if (isCampusOperator(user) && user.canManageMemberships === true) return "/admin?view=leadership";
  return dashboardPathForRole(user.role);
}

export default async function MembershipsRedirect() {
  const user = await requirePageSession();
  redirect(membershipsTarget(user)); // outside try/catch: redirect() throws by design
}
