import { prisma } from "@/lib/db/prisma";

/**
 * The currency a campus actually bills in. Fee summaries used to filter by the
 * locale default (often USD) and silently dropped every invoice raised in the
 * school's real currency (e.g. PKR). Pick the currency carrying the most
 * invoices; fall back to the locale default only when nothing is billed yet.
 */
export async function dominantInvoiceCurrency(
  schoolId: string,
  campusIds: string[] | null,
  fallback: string,
): Promise<string> {
  const groups = await prisma.invoice.groupBy({
    by: ["currency"],
    where: {
      campus: { schoolId },
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
      status: { not: "CANCELLED" },
    },
    _count: { _all: true },
  });
  return pickDominantCurrency(
    groups.map((g) => ({ currency: g.currency, count: g._count._all })),
    fallback,
  );
}

export function pickDominantCurrency(groups: { currency: string | null; count: number }[], fallback: string) {
  let best: { currency: string; count: number } | null = null;
  for (const g of groups) {
    if (!g.currency) continue;
    if (!best || g.count > best.count || (g.count === best.count && g.currency === fallback)) {
      best = { currency: g.currency, count: g.count };
    }
  }
  return best?.currency ?? fallback;
}
