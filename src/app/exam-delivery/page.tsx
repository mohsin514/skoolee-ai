"use client";

import { useLocale } from "@/components/locale/LocaleProvider";
import { PageHeader } from "@/components/ui/page-header";
import { SecureProfiles } from "@/components/school-ai/secure-browser";
import type { AssessmentLocale } from "@/lib/school-ai/assessment";

/**
 * SKO-449 Safe Exam Browser delivery profiles, framed in the academic lead's console (SPEC §6.3). RoleFrame supplies
 * the page's `<main>`, so this is a plain container with the one PageHeader (R1: the registry label "Secure exam
 * delivery" as the title) above the profiles. The `<title>` lives in the layout, since this page is a client component.
 */
export default function ExamDeliveryPage() {
  const { language } = useLocale();
  const locale: AssessmentLocale = language === "ar" || language === "ur" ? language : "en";
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5">
      <PageHeader
        title="Secure exam delivery"
        description="Tested Safe Exam Browser profiles for secure exams. Only keys reported by a tested client are trusted."
      />
      <SecureProfiles locale={locale} />
    </div>
  );
}
