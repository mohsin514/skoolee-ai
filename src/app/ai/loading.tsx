"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PAGE_CARD_BODY, PAGE_CARD_CLASS, PageSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { SkeletonRegion } from "@/components/ui/skeleton";
import { schoolAICopy } from "@/lib/school-ai/copy";
import { cn } from "@/lib/utils";

/**
 * /ai (AI Workflows) and /ai/studio (Exam Studio) open inside the caller's console frame, so they wait on the shell
 * skeleton: rail, header and the one page card with a PageHeader and body. The candidate exam routes never render
 * a shell (K-I2), so they wait on the same page card alone, centred on the canvas.
 */
export default function SchoolAiLoading() {
  const { language } = useLocale();
  const pathname = usePathname() ?? "";
  const label = schoolAICopy(language).loading;
  if (pathname.startsWith("/ai/exams")) {
    return (
      <SkeletonRegion label={label} className="sk-app-canvas flex min-h-dvh w-full p-[12px] sm:p-6">
        <div className={cn(PAGE_CARD_CLASS, "mx-auto w-full max-w-4xl")}>
          <div className={PAGE_CARD_BODY}><PageSkeleton rows={4} /></div>
        </div>
      </SkeletonRegion>
    );
  }
  return <RoleShellSkeleton navRows={8} label={label} />;
}
