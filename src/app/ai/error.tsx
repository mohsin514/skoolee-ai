"use client";

import Link from "next/link";
import { useLocale } from "@/components/locale/LocaleProvider";
import { buttonVariants } from "@/components/ui/button";
import { RUN_UI, t } from "@/components/ai-workflows/run-copy";
import { ErrorState } from "@/components/ui/error-state";
import { schoolAICopy } from "@/lib/school-ai/copy";

export default function SchoolAiErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const { language } = useLocale();
  const c = schoolAICopy(language);
  return <main className="sk-app-canvas grid min-h-dvh place-items-center p-4 sm:p-6" dir={language === "en" ? "ltr" : "rtl"}>
    <ErrorState variant="page" error={error} title={c.failed} onRetry={unstable_retry} retryLabel={c.retry}
      action={<Link href="/" className={buttonVariants({ variant: "outline" })}>{t(RUN_UI, "backHome", language === "ar" || language === "ur" ? language : "en")}</Link>} />
  </main>;
}
