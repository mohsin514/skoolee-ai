"use client";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/locale/LocaleProvider";

const WORDS = { en: "Demo school · synthetic data", ar: "مدرسة تجريبية · بيانات اصطناعية", ur: "ڈیمو اسکول · فرضی ڈیٹا" } as const;

/** Shown on the AI screens of a school listed in DEMO_SCHOOL_SLUGS (src/lib/ai-workflows/demo.ts). */
export function DemoSchoolBadge() {
  const { language } = useLocale();
  const lang = language === "ar" || language === "ur" ? language : "en";
  return (
    <div className="flex px-4 pt-4 sm:px-6" dir={lang === "en" ? "ltr" : "rtl"}>
      <Badge variant="warning" dot data-demo-school>{WORDS[lang]}</Badge>
    </div>
  );
}
