import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { dashboardPathForRole } from "@/lib/roles";
import { canLeadAcademics } from "@/lib/api/scope";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { PilotLedger } from "@/components/school-ai/pilot-ledger";

export const metadata = { title: "Pilot Ledger · Skoolee" };

/** SKO-507: the Pilot Ledger, for the school's academic lead (the principal, or the campus operator while it leads). */
export default async function PilotLedgerPage() {
  const user = await requirePageSession();
  const lead = user.role === "PRINCIPAL" || ((user.role === "CAMPUS_ADMIN" || user.role === "ADMIN") && await canLeadAcademics(user).catch(() => false));
  if (!lead) redirect(dashboardPathForRole(user.role));
  return <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={null} chatDock={user.schoolStatus !== "SUSPENDED"}><PilotLedger /></RoleFrame>;
}
