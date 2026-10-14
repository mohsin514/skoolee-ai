export const outcomes = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type Outcome = (typeof outcomes)[number];
export function reconcileCounts(items: { state: string }[]) {
  const counts = {
    total: items.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const item of items) {
    if (!outcomes.includes(item.state as Outcome))
      throw new Error("Unknown job outcome");
    counts[item.state as Outcome]++;
  }
  return counts;
}
export function failureCategory(reason: string | null) {
  if (/CONTACT|RECIPIENT/i.test(reason || "")) return "missing_contact";
  if (/AUTHORIZATION|PUBLICATION|BLOCKED/i.test(reason || ""))
    return "authorization";
  if (/UNCERTAIN/i.test(reason || "")) return "uncertain";
  if (/FILE|CSV|INVALID/i.test(reason || "")) return "invalid_file";
  if (/PROVIDER/i.test(reason || "")) return "provider";
  return "processing";
}
