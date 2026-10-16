import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, assertWorkspacePermission, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { ExamStudioShell } from "@/components/school-ai/exam-studio/exam-studio-shell";
import { SchoolAiShell } from "../school-ai-shell";

export const metadata = { title: "Exam Studio · Skoolee" };

export default async function ExamStudioPage() {
  const user = await requirePageSession();
  if (!["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"].includes(user.role)) redirect(dashboardPathForRole(user.role));
  try {
    await assertSchoolAiAccess(user, "view");
    await assertWorkspacePermission(user, "exams", "view");
  } catch (error) {
    if (error instanceof AccessDenied || error instanceof SchoolAiError && error.status === 403) redirect(dashboardPathForRole(user.role));
    throw error;
  }
  return <SchoolAiShell dashboardHref={dashboardPathForRole(user.role)} userName={user.fullName} userRole={user.role} examStudio>
    <ExamStudioShell role={user.role} campusId={user.campusId} userId={user.userId} />
  </SchoolAiShell>;
}
