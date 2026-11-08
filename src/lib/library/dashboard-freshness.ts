/**
 * SKAI-562: how fresh the library dashboard's figures are. The dashboard reads one snapshot; a failed refresh keeps
 * that snapshot on screen and marks it stale instead of hiding it, and an old snapshot is stale on its own.
 */
export const LIBRARY_STALE_AFTER_MINUTES = 15;

export type LibraryFreshness = { tone: "fresh" | "stale"; minutes: number; loadedAt: Date };

export function libraryDashboardFreshness(loadedAt: Date, refreshFailed: boolean, now = new Date()): LibraryFreshness {
  const minutes = Math.max(0, Math.floor((now.getTime() - loadedAt.getTime()) / 60_000));
  return { tone: refreshFailed || minutes > LIBRARY_STALE_AFTER_MINUTES ? "stale" : "fresh", minutes, loadedAt };
}

/** Off by default; set NEXT_PUBLIC_LIBRARY_DASHBOARD_FRESHNESS=true to show the line. */
export function libraryFreshnessEnabled(flag = process.env.NEXT_PUBLIC_LIBRARY_DASHBOARD_FRESHNESS): boolean {
  return flag === "true";
}
