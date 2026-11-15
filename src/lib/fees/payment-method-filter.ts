// SKAI-2044: payments.payment_method holds three vocabularies (Collect desk CASH/BANK, seed BANK_TRANSFER,
// legacy /api/fees/payment lowercase). The filter matches every stored spelling of the chosen method.
const ALIASES: Record<string, string[]> = {
  BANK: ["BANK", "BANK_TRANSFER"],
  BANK_TRANSFER: ["BANK", "BANK_TRANSFER"],
};

export function paymentMethodValues(method: string): string[] {
  const upper = method.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!upper) return [];
  const canonical = ALIASES[upper] ?? [upper];
  return Array.from(new Set(canonical.flatMap((v) => [v, v.toLowerCase()])));
}
