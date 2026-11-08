import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, assertWorkspacePermission, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { ExamStudioShell } from "@/components/school-ai/exam-studio/exam-studio-shell";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";
import { prisma } from "@/lib/db/prisma";
import { canLeadAcademics } from "@/lib/api/scope";

export const metadata = { title: "Exam Studio · Skoolee" };

/**
 * Exam Studio — SkooleeAI's second flagship (addendum 2026-10-22) — framed in the caller's own console; its
 * "Exam Studio" row lights up (`leafForPath` → `exam-studio`). The principal, teachers, and a campus operator while
 * it is the academic lead; the group admin has no Exam Studio and goes to its console.
 */
export default async function ExamStudioPage() {
  const user = await requirePageSession();
  if (user.role === "SUPER_ADMIN") redirect("/super");
  if (!["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"].includes(user.role)) redirect(dashboardPathForRole(user.role));
  // A campus operator authors exams only while it is the academic lead (no principal on the campus): the same rule as
  // its "Exam Studio" row (`schoolAiExams`). Otherwise it goes home, never to a studio it cannot use. Fails closed.
  if (user.role === "CAMPUS_ADMIN" || user.role === "ADMIN") {
    const academicLead = await canLeadAcademics(user).catch(() => false);
    if (!academicLead) redirect(dashboardPathForRole(user.role));
  }
  let allowed = true;
  try {
    await assertSchoolAiAccess(user, "view");
    await assertWorkspacePermission(user, "exams", "view");
  } catch (error) {
    if (error instanceof AccessDenied || error instanceof SchoolAiError && error.status === 403) allowed = false;
    else throw error;
  }
  if (!allowed) redirect(dashboardPathForRole(user.role));
  // Campus logo, else school logo: what the console's own sidebar shows (dashboard.ts). Read on the server so
  // the first paint has it (the session's `logoUrl` arrives only after the client's read); a failed read only costs the image.
  const brand = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { logoUrl: true, campuses: { where: { id: user.campusId ?? "" }, select: { logoUrl: true } } } }).catch(() => null);
  return (
    <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email} logoUrl={brand?.campuses[0]?.logoUrl || brand?.logoUrl || null} chatDock={user.schoolStatus !== "SUSPENDED"}>
      <ExamStudioShell role={user.role} campusId={user.campusId} userId={user.userId} />
    </RoleFrame>
  );
}
