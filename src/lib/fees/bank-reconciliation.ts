import { createHash } from "node:crypto";

// SKO-432: a bank transaction's identity is its account, date, amount and normalized description,
// plus its occurrence number among identical rows in the same statement. Re-importing the same data
// under another file name or column order yields the same keys, so nothing is imported twice, while
// two genuinely identical transactions on one statement remain distinct.

export function normalizeDescription(description: string) {
  return description.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

export function bankRowKeys(accountName: string, rows: { date: string; amountMinor: number; description: string }[]) {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const base = [accountName.trim().toLocaleLowerCase("en"), row.date, row.amountMinor, normalizeDescription(row.description)].join("|");
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return createHash("sha256").update(`${base}|${occurrence}`).digest("hex");
  });
}

/** Money conservation for one statement: everything received is allocated, credited or visibly unallocated. */
export function conservationReport(input: { received: number[]; allocated: number[]; credited: number[]; unallocated: number[]; adjustments?: number[] }) {
  const sum = (values: number[] = []) => values.reduce((total, value) => total + value, 0);
  const received = sum(input.received), allocated = sum(input.allocated), credited = sum(input.credited), unallocated = sum(input.unallocated), adjustments = sum(input.adjustments);
  return { received, allocated, credited, unallocated, adjustments, difference: received - allocated - credited - unallocated - adjustments, balanced: received === allocated + credited + unallocated + adjustments };
}
