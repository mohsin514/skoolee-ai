"use client";
import { ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";
import { SecureProfiles } from "./secure-browser";
import { secureBrowserCopy } from "./secure-browser-copy";

/** SKO-449 coordinator page for Safe Exam Browser delivery profiles. */
export function ExamDeliveryPage() {
  const { language } = useLocale();
  const locale = (["en", "ar", "ur"].includes(language) ? language : "en") as AssessmentLocale;
  const t = secureBrowserCopy(locale), rtl = locale !== "en";
  return <main lang={locale} dir={rtl ? "rtl" : "ltr"} className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-3 sm:p-6">
    <header className="sk-panel space-y-2 p-4 sm:p-6"><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck aria-hidden="true" className="h-6 w-6 text-primary" />{t.title}</h1><p className="text-sm text-slate-600">{t.summary}</p></header>
    <SecureProfiles locale={locale} />
  </main>;
}
