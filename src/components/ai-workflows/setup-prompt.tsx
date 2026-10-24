"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale/LocaleProvider";
import type { StepUiState } from "@/lib/ai-workflows/view";
import type { Lang, T } from "./run-copy";
import { SetupPromptCard } from "./setup-prompt-card";

type Stage = "NEW" | "RESUME" | "APPLYING" | "PARTIAL" | "READY";
const STAGE_COPY: Record<Stage, { title: T; description: T; action: T }> = {
  NEW: {
    title: { en: "Set up your first weeks", ar: "جهّز أسابيعك الأولى", ur: "اپنے پہلے ہفتے تیار کریں" },
    description: { en: "Answer a few short questions and Skoolee sets up your first weeks for you. Anything that changes school records waits for you to review it.", ar: "أجب عن أسئلة قصيرة ويجهز Skoolee أسابيعك الأولى. أي تغيير في سجلات المدرسة ينتظر مراجعتك.", ur: "چند مختصر سوالات کے جواب دیں، اسکولی آپ کے پہلے ہفتے تیار کرے گا۔ اسکول ریکارڈ کی ہر تبدیلی آپ کے جائزے کا انتظار کرے گی۔" },
    action: { en: "Start", ar: "ابدأ", ur: "شروع کریں" },
  },
  RESUME: {
    title: { en: "Pick up your setup", ar: "تابع إعدادك", ur: "اپنا سیٹ اپ جاری رکھیں" },
    description: { en: "Your answers so far are kept. Carry on whenever you're ready.", ar: "إجاباتك حتى الآن محفوظة. تابع متى كنت جاهزاً.", ur: "آپ کے اب تک کے جوابات محفوظ ہیں۔ جب چاہیں جاری رکھیں۔" },
    action: { en: "Continue setup", ar: "متابعة الإعداد", ur: "سیٹ اپ جاری رکھیں" },
  },
  APPLYING: {
    title: { en: "Your setup is waiting for you", ar: "إعدادك بانتظارك", ur: "آپ کا سیٹ اپ آپ کا منتظر ہے" },
    description: { en: "Some changes are ready for your review.", ar: "بعض التغييرات جاهزة لمراجعتك.", ur: "کچھ تبدیلیاں آپ کے جائزے کے لیے تیار ہیں۔" },
    action: { en: "Review changes", ar: "مراجعة التغييرات", ur: "تبدیلیاں دیکھیں" },
  },
  PARTIAL: {
    title: { en: "Finish your setup", ar: "أكمل إعدادك", ur: "اپنا سیٹ اپ مکمل کریں" },
    description: { en: "A few steps still need you or a colleague.", ar: "بعض الخطوات ما زالت تحتاجك أو تحتاج زميلاً.", ur: "کچھ مراحل کو ابھی آپ کی یا کسی ساتھی کی ضرورت ہے۔" },
    action: { en: "Continue setup", ar: "متابعة الإعداد", ur: "سیٹ اپ جاری رکھیں" },
  },
  READY: {
    title: { en: "A few new setup questions", ar: "أسئلة إعداد جديدة", ur: "سیٹ اپ کے چند نئے سوالات" },
    description: { en: "Your setup gained a few questions. Your earlier answers are kept.", ar: "أُضيفت أسئلة قليلة إلى إعدادك، وتبقى إجاباتك السابقة.", ur: "آپ کے سیٹ اپ میں چند سوالات شامل ہوئے ہیں۔ پچھلے جوابات محفوظ ہیں۔" },
    action: { en: "Continue setup", ar: "متابعة الإعداد", ur: "سیٹ اپ جاری رکھیں" },
  },
};
const WORDS: Record<"eyebrow" | "strip" | "answer" | "review" | "build", T> = {
  eyebrow: { en: "AI Workflows", ar: "سير عمل الذكاء الاصطناعي", ur: "اے آئی ورک فلوز" },
  strip: { en: "How setup works", ar: "كيف يعمل الإعداد", ur: "سیٹ اپ کیسے ہوتا ہے" },
  answer: { en: "Answer", ar: "أجب", ur: "جواب" },
  review: { en: "Review", ar: "راجع", ur: "جائزہ" },
  build: { en: "Build", ar: "ابنِ", ur: "بنائیں" },
};

const stageOf = (status: string): Stage =>
  status === "NEW" ? "NEW" : status === "APPLYING" ? "APPLYING" : status === "PARTIAL" ? "PARTIAL" : status === "READY" ? "READY" : "RESUME";

/** Answer → Review → Build, from the stored status only (no counts, no ETAs). */
function milestones(stage: Stage, language: Lang): Array<{ label: string; state: StepUiState }> {
  const built = stage === "APPLYING" || stage === "PARTIAL";
  return [
    { label: WORDS.answer[language], state: built ? "saved" : stage === "NEW" ? "planned" : "draft" },
    { label: WORDS.review[language], state: built ? "saved" : "planned" },
    { label: WORDS.build[language], state: stage === "APPLYING" ? "awaiting_confirm" : stage === "PARTIAL" ? "handed_off" : "planned" },
  ];
}

/** First-login prompt for a role questionnaire; hidden once the setup is ready or set aside three times. */
export function SetupPrompt() {
  const { language } = useLocale();
  const [setup, setSetup] = useState<{ key: string; status: string; show: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/ai-workflows/questionnaire").then(response => (response.ok ? response.json() : null)).then(body => { if (live) setSetup(body?.setup ?? null); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!setup?.show) return null;
  const stage = stageOf(setup.status);
  const copy = STAGE_COPY[stage];
  return (
    <SetupPromptCard data-ai-setup-prompt={setup.status} eyebrow={WORDS.eyebrow[language]} title={copy.title[language]} description={copy.description[language]}
      action={{ label: copy.action[language], href: "/ai/setup" }} milestones={milestones(stage, language)} stripLabel={WORDS.strip[language]} tourAnchor="today.setup" />
  );
}
