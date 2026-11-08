import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { ExamPageClient } from "@/components/school-ai/exam-page-client";

export default async function SchoolAiExamPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageSession();
  if (!["STUDENT", "TEACHER", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(user.role)) notFound();
  return <ExamPageClient id={(await params).id} student={user.role === "STUDENT"} />;
}
