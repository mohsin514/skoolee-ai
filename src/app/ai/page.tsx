import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { SchoolAIWorkspace } from "@/components/school-ai/school-ai-workspace";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "AI Workflows" };

/**
 * AI Workflows — the School AI workspace, one of SkooleeAI's two flagships (addendum 2026-10-22) — framed in the
 * caller's own console (SPEC §6.3, M107): the console's "AI Workflows" row lights up (`leafForPath` → `ai-workflows`).
 * The institution authority answers the setup questionnaire here (`?workflow=schoolSetup`) and AI drafts the
 * school's set-up; every draft is reviewed and approved before anything applies. The group admin is admitted too:
 * it is the authority that runs the questionnaire, while the server still gives it no campus write tools (G42).
 * Framed here and in /ai/studio only — never in ai/layout.tsx, which also wraps the candidate exam routes (K-I2).
 */
export default async function SchoolAiPage() {
  const user = await requirePageSession();
  let allowed = true;
  try { await assertSchoolAiAccess(user, "view"); }
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
      <SchoolAIWorkspace role={user.role} campusId={user.campusId} />
    </RoleFrame>
  );
}
