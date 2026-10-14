"use client";

import { RefreshCw } from "lucide-react";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { schoolAICopy } from "@/lib/school-ai/copy";

export default function SchoolAiErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const { language } = useLocale();
  const c = schoolAICopy(language);
  return <main className="grid min-h-dvh place-items-center bg-background p-6" dir={language === "en" ? "ltr" : "rtl"}>
    <div className="w-full max-w-lg"><TaskFeedback kind="error" title={c.failed} action={<Button onClick={unstable_retry}><RefreshCw aria-hidden="true" />{c.retry}</Button>} /></div>
  </main>;
}
