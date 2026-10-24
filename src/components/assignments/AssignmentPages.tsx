"use client";
import { Suspense, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { AssignmentWorkspace } from "./AssignmentWorkspace";
import { LearnerAssignments } from "./LearnerAssignments";
import { getAssignmentCopy } from "./assignment-copy";

// SKO-409 page shells: each workspace puts the shared views under its own PageHeader.
const useCopy = () => getAssignmentCopy(useLocale().language);

export function TeacherAssignmentsPage() {
  const t = useCopy();
  const [createRequest, setCreateRequest] = useState(0);
  return (
    <TeacherPage
      icon={ClipboardCheck}
      title={t.homeworkTitle}
      description={t.homeworkSummary}
      primaryAction={{ id: "create-homework", label: t.createHomework, icon: Plus, onClick: () => setCreateRequest((n) => n + 1) }}
    >
      <AssignmentWorkspace createRequest={createRequest} hideCreateButton />
    </TeacherPage>
  );
}
export function StudentAssignmentsPage() {
  const t = useCopy();
  return <StudentPage icon={ClipboardCheck} title={t.learnerTitle} description={t.learnerSummary}><Suspense fallback={null}><LearnerAssignments audience="learner" /></Suspense></StudentPage>;
}
export function ParentAssignmentsPage() {
  const t = useCopy();
  return <ParentPage icon={ClipboardCheck} title={t.guardianTitle} description={t.guardianSummary}><Suspense fallback={null}><LearnerAssignments audience="guardian" /></Suspense></ParentPage>;
}
