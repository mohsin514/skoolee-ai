"use client";

import { useLocale } from "@/components/locale/LocaleProvider";
import { ErrorState } from "@/components/ui/error-state";
import { schoolAICopy } from "@/lib/school-ai/copy";

export default function SchoolAiErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const { language } = useLocale();
  const c = schoolAICopy(language);
  return <main className="sk-app-canvas grid min-h-dvh place-items-center p-4 sm:p-6" dir={language === "en" ? "ltr" : "rtl"}>
    <ErrorState variant="page" error={error} title={c.failed} onRetry={unstable_retry} retryLabel={c.retry} />
  </main>;
}
