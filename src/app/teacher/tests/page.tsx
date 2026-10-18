"use client";

import { ClipboardList } from "lucide-react";
import { ExamCycleManager } from "@/components/academic/ExamCycleManager";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { QuestionNetwork } from "@/components/question-network/question-network";

export default function TeacherTestsPage() {
  return (
    <TeacherPage
      tone="exams"
      icon={ClipboardList}
      eyebrow="Assessment Pipeline"
      title="My Tests & Quizzes"
      summary="Plan, track and release your assessments stage by stage"
    >
      <div className="space-y-6">
        <ExamCycleManager role="TEACHER" />
        <QuestionNetwork />
      </div>
    </TeacherPage>
  );
}
