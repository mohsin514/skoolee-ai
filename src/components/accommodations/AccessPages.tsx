"use client";
import { Accessibility } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { CoordinatorAccess, LearnerAccess, StaffAccess } from "./AccessPlans";
import { getAccessCopy } from "./access-copy";

// Page titles are the registry labels (teacher "Access plans", family "Support plans", learner
// "Support plan"); the descriptions come from the access copy.
const useCopy = () => getAccessCopy(useLocale().language);
export function StudentAccessPage() { const t = useCopy(); return <StudentPage icon={Accessibility} title="Support plan" description={t.learnerSummary}><LearnerAccess /></StudentPage>; }
export function ParentAccessPage() { const t = useCopy(); return <ParentPage icon={Accessibility} title="Support plans" description={t.guardianSummary}><LearnerAccess /></ParentPage>; }
export function TeacherAccessPage() { const t = useCopy(); return <TeacherPage icon={Accessibility} title="Access plans" description={t.staffSummary}><StaffAccess /></TeacherPage>; }
/** Designated approvers on the framed `/accommodations` route (the shell and the page card come from RoleFrame). */
export function CoordinatorAccessPage() {
  const t = useCopy();
  // RoleFrame draws the one page card and its padding: the page is the PageHeader and the panel, no card of its own.
  return <div className="min-w-0 space-y-6">
    <PageHeader icon={Accessibility} title="Access plans" description={t.summary} />
    <CoordinatorAccess />
  </div>;
}
