import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { ExamPageClient } from "@/components/school-ai/exam-page-client";
import { RoleFrame } from "@/components/role-dashboard/RoleFrame";

export default async function SchoolAiExamsPage() {
  const user = await requirePageSession();
  if (!["STUDENT", "TEACHER", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(user.role)) notFound();
  return <RoleFrame role={user.role} userName={user.fullName || user.email} userEmail={user.email}>
    <ExamPageClient student={user.role === "STUDENT"} framed />
  </RoleFrame>;
}
