"use client";
import { Suspense } from "react";
import { ClipboardCheck } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { AssignmentWorkspace } from "./AssignmentWorkspace";
import { LearnerAssignments } from "./LearnerAssignments";
import { getAssignmentCopy } from "./assignment-copy";

// SKO-409 page shells: each workspace keeps its own chrome around the shared views.
const useCopy = () => getAssignmentCopy(useLocale().language);

export function TeacherAssignmentsPage() {
  const t = useCopy();
  return <TeacherPage tone="exams" icon={ClipboardCheck} eyebrow={t.eyebrow} title={t.title} summary={t.staffSummary}><AssignmentWorkspace /></TeacherPage>;
}
export function StudentAssignmentsPage() {
  const t = useCopy();
  return <StudentPage tone="classes" icon={ClipboardCheck} eyebrow={t.eyebrow} title={t.title} summary={t.learnerSummary}><Suspense fallback={null}><LearnerAssignments audience="learner" /></Suspense></StudentPage>;
}
export function ParentAssignmentsPage() {
  const t = useCopy();
  return <ParentPage tone="classes" icon={ClipboardCheck} eyebrow={t.eyebrow} title={t.title} summary={t.guardianSummary}><Suspense fallback={null}><LearnerAssignments audience="guardian" /></Suspense></ParentPage>;
}
