"use client";
import { Target } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { ObjectiveMap } from "./ObjectiveMap";
import { getObjectiveMapCopy } from "./objective-map-copy";

export function TeacherObjectiveMapPage() {
  const t = getObjectiveMapCopy(useLocale().language);
  return <TeacherPage tone="exams" icon={Target} eyebrow={t.eyebrow} title={t.title} summary={t.summary}><ObjectiveMap /></TeacherPage>;
}
/** Curriculum leads outside a role workspace. */
export function LeadObjectiveMapPage() {
  const { language } = useLocale();
  const t = getObjectiveMapCopy(language), rtl = language === "ar" || language === "ur";
  return <main lang={language} dir={rtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-3 sm:p-6">
    <header className="sk-panel space-y-2 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Target aria-hidden="true" className="h-6 w-6 text-[#8127cf]" />{t.title}</h1>
      <p className="text-sm text-slate-600">{t.summary}</p>
    </header>
    <ObjectiveMap />
  </main>;
}
