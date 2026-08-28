import { cn } from "@/lib/utils";

/**
 * Shared loading placeholders.
 *
 * A skeleton should echo the shape of the content that is about to appear, so
 * the page does not jump when data lands. A bare spinner tells the user nothing
 * about what is coming; these do.
 *
 * Use these for *content* that is loading. Keep a spinner for an action in
 * progress (a save button, a redirect) where there is no shape to preview.
 *
 * Built on the existing `.skeleton-shimmer` / `.animate-skeleton-in` styles in
 * globals.css so everything shimmers identically.
 */

export function Skeleton({
  className,
  /** Stagger index — later rows fade in slightly after earlier ones. */
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-lg bg-[#e8e0ec]/50", className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * The same placeholder at the radius the card-shaped consoles use, plus a
 * `dark` fill for bars that sit on a near-black hero.
 *
 * Five modules had each grown their own byte-identical copy of this, which is
 * how the shimmer timing drifted between them. One definition, one timing.
 */
export function SkeletonBar({
  className,
  tone = "light",
  delay = 0,
}: {
  className?: string;
  tone?: "light" | "dark";
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton-shimmer rounded-2xl",
        tone === "dark" ? "bg-white/12" : "bg-[#e8e0ec]/55",
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

/** Wrapper that announces loading to screen readers exactly once. */
export function SkeletonRegion({
  children,
  className,
  label = "Loading",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={className} role="status" aria-busy="true" aria-label={label}>
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Stacked rows with an avatar and two lines — for lists of people or records. */
export function SkeletonList({
  rows = 5,
  className,
  label,
}: {
  rows?: number;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonRegion className={cn("space-y-2", className)} label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-skeleton-in flex items-center gap-4 rounded-2xl border border-[#cfc2d6]/10 bg-white p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Card grid — for dashboards and stat tiles. */
export function SkeletonCards({
  count = 4,
  className,
  cardClassName,
  label,
}: {
  count?: number;
  className?: string;
  cardClassName?: string;
  label?: string;
}) {
  return (
    <SkeletonRegion
      className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}
      label={label}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "animate-skeleton-in rounded-[24px] border border-[#cfc2d6]/12 bg-white p-5",
            cardClassName,
          )}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Header row plus body rows — for tabular data. */
export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
  label,
}: {
  rows?: number;
  columns?: number;
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonRegion
      className={cn(
        "overflow-hidden rounded-2xl border border-[#cfc2d6]/12 bg-white",
        className,
      )}
      label={label}
    >
      <div
        className="grid gap-4 border-b border-[#cfc2d6]/12 bg-[#faf7fc] px-4 py-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20 rounded-full" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="animate-skeleton-in grid gap-4 border-b border-[#cfc2d6]/8 px-4 py-3 last:border-0"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
            animationDelay: `${r * 50}ms`,
          }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 w-full rounded-full" />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A single large block — for charts, calendars and editors. */
export function SkeletonBlock({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <SkeletonRegion label={label}>
      <Skeleton className={cn("animate-skeleton-in h-64 w-full rounded-[24px]", className)} />
    </SkeletonRegion>
  );
}
