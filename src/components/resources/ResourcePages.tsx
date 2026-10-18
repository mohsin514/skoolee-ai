"use client";
import { FolderOpen } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { StudentPage } from "@/components/student/student-page";
import { ParentPage } from "@/components/parent/parent-page";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { ResourceLibrary } from "./ResourceLibrary";
import { getResourceCopy } from "./resource-copy";
import { TeacherStudyDesk } from "@/components/study/study-assistant";

// SKO-400 page shells: each workspace keeps its own chrome around the shared library.
const useCopy = () => getResourceCopy(useLocale().language);

export function StudentResourcesPage() {
  const t = useCopy();
  return <StudentPage tone="classes" icon={FolderOpen} eyebrow={t.eyebrow} title={t.title} summary={t.learnerSummary}><ResourceLibrary audience="learner" /></StudentPage>;
}
export function ParentResourcesPage() {
  const t = useCopy();
  return <ParentPage tone="classes" icon={FolderOpen} eyebrow={t.eyebrow} title={t.title} summary={t.guardianSummary}><ResourceLibrary audience="guardian" /></ParentPage>;
}
export function TeacherResourcesPage() {
  const t = useCopy();
  return <TeacherPage tone="classes" icon={FolderOpen} eyebrow={t.eyebrow} title={t.title} summary={t.staffSummary}><ResourceLibrary audience="staff" /><div className="mt-6"><TeacherStudyDesk /></div></TeacherPage>;
}
/** Managers and campus leads, outside a role workspace. */
export function ManagerResourcesPage() {
  const { language } = useLocale();
  const t = getResourceCopy(language), rtl = language === "ar" || language === "ur";
  return <main lang={language} dir={rtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-3 sm:p-6">
    <header className="sk-panel space-y-2 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><FolderOpen aria-hidden="true" className="h-6 w-6 text-primary" />{t.title}</h1>
      <p className="text-sm text-slate-600">{t.staffSummary}</p>
    </header>
    <ResourceLibrary audience="staff" />
  </main>;
}
