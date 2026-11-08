// SKAI-1534: every persisted attendance status has its own bucket, so the buckets always sum to total.
export const HISTORY_STATUSES = ["PRESENT", "ABSENT", "LEAVE", "LATE", "EXCUSED", "PARTIAL"] as const;
type Status = (typeof HISTORY_STATUSES)[number];
const KEY: Record<Status, "present" | "absent" | "leave" | "late" | "excused" | "partial"> = {
  PRESENT: "present", ABSENT: "absent", LEAVE: "leave", LATE: "late", EXCUSED: "excused", PARTIAL: "partial",
};

export type HistoryBucket = { date: string; present: number; absent: number; leave: number; late: number; excused: number; partial: number; total: number };

export function bucketHistory(raw: { date: Date; status: string; _count: number }[]): HistoryBucket[] {
  const byDate = new Map<string, HistoryBucket>();
  for (const entry of raw) {
    const date = entry.date.toISOString().slice(0, 10);
    let bucket = byDate.get(date);
    if (!bucket) byDate.set(date, (bucket = { date, present: 0, absent: 0, leave: 0, late: 0, excused: 0, partial: 0, total: 0 }));
    const key = KEY[entry.status as Status];
    // An unknown future status still counts toward total; it is never silently dropped from it.
    if (key) bucket[key] += entry._count;
    bucket.total += entry._count;
  }
  return Array.from(byDate.values());
}
