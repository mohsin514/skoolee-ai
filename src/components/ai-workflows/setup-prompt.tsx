"use client";
import { useEffect, useState } from "react";
import { FlagshipCard } from "@/components/ui/flagship";
import { useLocale } from "@/components/locale/LocaleProvider";

const COPY = {
  title: { en: "Your week, built live", ar: "أسبوعك، يُبنى أمامك", ur: "آپ کا ہفتہ، ابھی تیار" },
  start: { en: "Answer a few questions about your classes and Skoolee sets up your first weeks: plans, meeting slots and class tests. You review each one before it is saved.", ar: "أجب عن أسئلة قليلة عن فصولك ويجهز Skoolee أسابيعك الأولى. تراجع كل شيء قبل حفظه.", ur: "اپنی کلاسوں کے بارے میں چند سوالات کے جواب دیں، اسکولی آپ کے پہلے ہفتے تیار کرے گا۔ ہر چیز محفوظ ہونے سے پہلے آپ دیکھیں گے۔" },
  resume: { en: "Your setup is saved where you left it.", ar: "إعدادك محفوظ حيث توقفت.", ur: "آپ کا سیٹ اپ وہیں محفوظ ہے جہاں چھوڑا تھا۔" },
  begin: { en: "Set up my week", ar: "جهّز أسبوعي", ur: "میرا ہفتہ تیار کریں" },
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
      action={{ label: fresh ? COPY.begin[language] : COPY.continue[language], href: "/ai/setup" }} tourAnchor="teacher.today.setup" />
  );
}
