"use client";
import { Accessibility } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { CoordinatorAccess, LearnerAccess, StaffAccess } from "./AccessPlans";
import { getAccessCopy } from "./access-copy";

const useCopy = () => getAccessCopy(useLocale().language);
export function StudentAccessPage() { const t = useCopy(); return <StudentPage tone="exams" icon={Accessibility} eyebrow={t.eyebrow} title={t.learnerTitle} summary={t.learnerSummary}><LearnerAccess /></StudentPage>; }
export function ParentAccessPage() { const t = useCopy(); return <ParentPage tone="exams" icon={Accessibility} eyebrow={t.eyebrow} title={t.learnerTitle} summary={t.guardianSummary}><LearnerAccess /></ParentPage>; }
export function TeacherAccessPage() { const t = useCopy(); return <TeacherPage tone="exams" icon={Accessibility} eyebrow={t.eyebrow} title={t.staffTitle} summary={t.staffSummary}><StaffAccess /></TeacherPage>; }
/** Designated approvers outside a role workspace. */
export function CoordinatorAccessPage() {
  const { language } = useLocale();
  const t = getAccessCopy(language), rtl = language === "ar" || language === "ur";
  return <main lang={language} dir={rtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-3 sm:p-6">
    <header className="sk-panel space-y-2 p-4 sm:p-6"><h1 className="flex items-center gap-2 text-2xl font-bold"><Accessibility aria-hidden="true" className="h-6 w-6 text-primary" />{t.title}</h1><p className="text-sm text-slate-600">{t.summary}</p></header>
    <CoordinatorAccess />
  </main>;
}
