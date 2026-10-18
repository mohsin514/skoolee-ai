"use client";
import { Lightbulb } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { StudyAssistant } from "@/components/study/study-assistant";

// SKO-428: study help grounded in the learner's approved class material.
export default function StudentStudyPage() {
  return <StudentPage tone="classes" icon={Lightbulb} eyebrow="Learning" title="Study help" summary="Explanations from your class material, with sources"><StudyAssistant /></StudentPage>;
}
