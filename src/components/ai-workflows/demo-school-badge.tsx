"use client";
import { FlaskConical } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/tooltip";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

const WORDS = { en: "Demo school · synthetic data", ar: "مدرسة تجريبية · بيانات اصطناعية", ur: "ڈیمو اسکول · فرضی ڈیٹا" } as const;
const BAND = {
  title: { en: "Demo school", ar: "مدرسة تجريبية", ur: "ڈیمو اسکول" },
  line: { en: "Synthetic data", ar: "بيانات اصطناعية", ur: "فرضی ڈیٹا" },
  tip: {
    en: "Every person and record in this school is made up for trying Skoolee. No real family or pupil sees it.",
    ar: "كل شخص وسجل في هذه المدرسة مُختلَق لتجربة Skoolee. لا تراه أي أسرة أو تلميذ حقيقي.",
    ur: "اس اسکول کا ہر فرد اور ہر ریکارڈ Skoolee آزمانے کے لیے فرضی ہے۔ کوئی حقیقی خاندان یا طالب علم اسے نہیں دیکھتا۔",
  },
  tipLabel: { en: "About the demo school", ar: "عن المدرسة التجريبية", ur: "ڈیمو اسکول کے بارے میں" },
} as const;

/**
 * Shown on the AI screens of a school listed in DEMO_SCHOOL_SLUGS (src/lib/ai-workflows/demo.ts).
 * No outer padding: callers place it inside their own content column. `inline` is a chip for hero
 * eyebrows; `band` is a full-width notice for sub-pages. data-demo-school sits on the visible element.
 */
export function DemoSchoolBadge({ variant = "inline", className }: { variant?: "band" | "inline"; className?: string }) {
  const { language } = useLocale();
  const lang = language === "ar" || language === "ur" ? language : "en";
  if (variant === "band") {
    return (
      <Alert compact tone="warning" icon={FlaskConical} live="off" data-demo-school className={className}>
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="font-semibold">{BAND.title[lang]}</strong>
          <span>{BAND.line[lang]}</span>
          <InfoTip content={BAND.tip[lang]} label={BAND.tipLabel[lang]} />
        </span>
      </Alert>
    );
  }
  return (
    <Badge variant="warning" data-demo-school className={cn("w-fit", className)}>
      <FlaskConical aria-hidden="true" />
      <span>{WORDS[lang]}</span>
    </Badge>
  );
}
