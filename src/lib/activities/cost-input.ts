import { parseMoney } from "@/lib/locale/package-core";

/** SKAI-2179: staff type the cost as they say it ("25"); the API and every display use minor units. */
export function costToMinor(amount: string, currency: string): number {
  const text = String(amount ?? "").replace(/,/g, "").trim();
  if (!text) return 0;
  try { return parseMoney(text, currency).minor; } catch { return Number.NaN; }
}
