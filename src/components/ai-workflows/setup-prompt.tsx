"use client";
import { useEffect, useState } from "react";
import { FlagshipCard } from "@/components/ui/flagship";
import { useLocale } from "@/components/locale/LocaleProvider";

const COPY = {
  title: { en: "Set up your first weeks", ar: "جهّز أسابيعك الأولى", ur: "اپنے پہلے ہفتے تیار کریں" },
  start: { en: "Answer a few short questions and Skoolee sets up your first weeks for you. Anything that changes school records waits for you to review it.", ar: "أجب عن أسئلة قصيرة ويجهز Skoolee أسابيعك الأولى. أي تغيير في سجلات المدرسة ينتظر مراجعتك.", ur: "چند مختصر سوالات کے جواب دیں، اسکولی آپ کے پہلے ہفتے تیار کرے گا۔ اسکول ریکارڈ کی ہر تبدیلی آپ کے جائزے کا انتظار کرے گی۔" },
  resume: { en: "Your setup is saved where you left it.", ar: "إعدادك محفوظ حيث توقفت.", ur: "آپ کا سیٹ اپ وہیں محفوظ ہے جہاں چھوڑا تھا۔" },
  begin: { en: "Start", ar: "ابدأ", ur: "شروع کریں" },
  continue: { en: "Continue setup", ar: "متابعة الإعداد", ur: "سیٹ اپ جاری رکھیں" },
};

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
  const fresh = setup.status === "NEW";
  return (
    <FlagshipCard kind="ai-workflows" title={COPY.title[language]} description={fresh ? COPY.start[language] : COPY.resume[language]}
      action={{ label: fresh ? COPY.begin[language] : COPY.continue[language], href: "/ai/setup" }} tourAnchor="today.setup" />
  );
}
