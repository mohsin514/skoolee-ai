"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "@/components/locale/LocaleProvider";
import { PAGE_CARD_BODY, PAGE_CARD_CLASS, PageSkeleton, RoleShellSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { Skeleton, SkeletonBar, SkeletonRegion } from "@/components/ui/skeleton";
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
  if (pathname === "/ai") {
    // Shaped like the /ai first paint: ink cover, the overlapping Ask card, example chips, launch tiles.
    return (
      <RoleShellSkeleton navRows={8} label={label}>
        <div aria-hidden="true" className="mx-auto flex w-full max-w-5xl flex-col">
          <div className="sk-ink-cover h-40 rounded-3xl" />
          <div className="relative z-10 -mt-8 space-y-4 rounded-3xl border border-border-subtle bg-card p-4 shadow-glow sm:-mt-10 sm:p-6">
            <div className="flex h-36 flex-col justify-end rounded-3xl border border-border-subtle bg-surface-subtle p-3">
              <SkeletonBar className="ms-auto h-11 w-24" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map(chip => <Skeleton key={chip} delay={chip * 60} className="h-11 w-40 rounded-xl" />)}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(tile => <SkeletonBar key={tile} delay={tile * 40} className="h-28" />)}
          </div>
        </div>
      </RoleShellSkeleton>
    );
  }
  return <RoleShellSkeleton navRows={8} label={label} />;
}
