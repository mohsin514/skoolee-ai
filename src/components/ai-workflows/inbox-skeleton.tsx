"use client";
import { SkeletonBar, SkeletonRegion } from "@/components/ui/skeleton";

/** Three placeholder hand-off rows, shaped like inbox-card: a tile, two text bars and a button bar. */
export function InboxSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-3">
      {[0, 1, 2].map(row => (
        <div key={row} className="flex flex-wrap items-center gap-4 rounded-3xl border border-border-subtle bg-card p-4 sm:p-5">
          <SkeletonBar className="size-10 rounded-xl" delay={row * 80} />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-2/5 rounded-lg" delay={row * 80} />
            <SkeletonBar className="h-3 w-3/5 rounded-lg" delay={row * 80 + 40} />
          </div>
          <SkeletonBar className="h-11 w-full rounded-2xl sm:w-40" delay={row * 80 + 80} />
        </div>
      ))}
    </SkeletonRegion>
  );
}
