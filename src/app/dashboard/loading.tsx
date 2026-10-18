import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

// CP-6: a loading state should be a skeleton of the layout that follows, not a
// spinner in an empty box. Matching the real grid means no layout shift when the
// content lands, and the user can see WHAT is loading rather than just THAT
// something is.
export default function DashboardLoading() {
  return (
    <SkeletonRegion className="flex-1 space-y-6 p-4 sm:p-6" label="Loading dashboard">
      {/* Page heading */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" delay={60} />
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="sk-panel space-y-3 p-5">
            <Skeleton className="h-3 w-24" delay={i * 60} />
            <Skeleton className="h-8 w-20" delay={i * 60 + 30} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="sk-panel p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" delay={i * 50} />
              <Skeleton className="h-4 flex-1" delay={i * 50} />
              <Skeleton className="hidden h-4 w-24 sm:block" delay={i * 50} />
              <Skeleton className="h-4 w-16" delay={i * 50} />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
