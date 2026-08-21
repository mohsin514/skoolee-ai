// CP-6: a loading state should be a skeleton of the layout that follows, not a
// spinner in an empty box. Matching the real grid means no layout shift when the
// content lands, and the user can see WHAT is loading rather than just THAT
// something is.
export default function DashboardLoading() {
  return (
    <div className="flex-1 space-y-6 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading dashboard…</span>

      {/* Page heading */}
      <div className="space-y-2">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-black/5" />
        <div className="h-4 w-80 animate-pulse rounded bg-black/5" />
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-3xl border border-black/5 bg-white p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-black/5" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-black/5" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-black/5 bg-white p-5">
        <div className="mb-4 h-4 w-40 animate-pulse rounded bg-black/5" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-black/5" />
              <div className="h-4 flex-1 animate-pulse rounded bg-black/5" />
              <div className="h-4 w-24 animate-pulse rounded bg-black/5" />
              <div className="h-4 w-16 animate-pulse rounded bg-black/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
