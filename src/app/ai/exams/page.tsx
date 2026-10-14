import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { ExamPageClient } from "@/components/school-ai/exam-page-client";

export default async function SchoolAiExamsPage() {
  const user = await requirePageSession();
  if (!["STUDENT", "TEACHER", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(user.role)) notFound();
  return <ExamPageClient student={user.role === "STUDENT"} />;
}
