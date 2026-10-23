import { AutomaticWorkspace } from "@/components/automation/automatic-workspace";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, assertWorkspacePermission, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { SchoolAIWorkspace } from "@/components/school-ai/school-ai-workspace";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "AI Workflows" };

/** The automatic workspace is scoped to the signed-in role and its current permissions. */
export default async function SchoolAiPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const query = await searchParams;
  const user = await requirePageSession();
  let allowed = true;
  const personalWorkspace = ["APP_OWNER", "STUDENT", "PARENT"].includes(user.role);
  try { if (!personalWorkspace) await assertSchoolAiAccess(user, "view"); else if (user.role !== "APP_OWNER") await assertWorkspacePermission(user, "ai", "view"); }
  catch (error) {
    if (error instanceof AccessDenied || error instanceof SchoolAiError && error.status === 403) allowed = false;
    else throw error;
  }
  if (!allowed) redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>
      {personalWorkspace ? <div className="mx-auto max-w-5xl p-6"><AutomaticWorkspace campusId={user.role === "APP_OWNER" ? null : user.campusId} role={user.role} roleSetup={query.setup === "1"} autoStart={query.setup === "1"} /></div> : <SchoolAIWorkspace role={user.role} campusId={user.campusId} />}
    </RoleFrame>
  );
}
