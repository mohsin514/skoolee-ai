"use client";

import { ClipboardList } from "lucide-react";
import { ExamCycleManager } from "@/components/academic/ExamCycleManager";
import { TeacherPage } from "@/components/teacher/teacher-page";

export default function TeacherTestsPage() {
  return (
    <TeacherPage
      icon={ClipboardList}
      eyebrow="Assessment Pipeline"
      title="My Tests & Quizzes"
      summary="Plan, track and release your assessments stage by stage"
    >
      <ExamCycleManager role="TEACHER" />
    </TeacherPage>
  );
}
