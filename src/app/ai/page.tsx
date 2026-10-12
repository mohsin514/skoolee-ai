import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { assertSchoolAiAccess, SchoolAiError } from "@/lib/school-ai/access";
import { AccessDenied } from "@/lib/auth/policy";
import { dashboardPathForRole } from "@/lib/roles";
import { SchoolAIWorkspace } from "@/components/school-ai/school-ai-workspace";
import { SchoolAiShell } from "./school-ai-shell";

export default async function SchoolAiPage() {
  const user = await requirePageSession();
  try { await assertSchoolAiAccess(user, "view"); }
  catch (error) {
    if (error instanceof AccessDenied || error instanceof SchoolAiError && error.status === 403) redirect(dashboardPathForRole(user.role));
    throw error;
  }
  return <SchoolAiShell dashboardHref={dashboardPathForRole(user.role)} userName={user.fullName} userRole={user.role}>
    <SchoolAIWorkspace role={user.role} campusId={user.campusId} />
  </SchoolAiShell>;
}
