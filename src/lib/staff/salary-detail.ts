import { formatMoney, type LocalePackage } from "@/lib/locale/package";

/** Timeline text for a basic-salary change, in the school's own currency (never a hard-coded "Rs."). */
export function salaryChangeDetail(beforeMinor: number, afterMinor: number, locale: LocalePackage): string {
  const money = (minor: number) => formatMoney({ currency: locale.currency, minor: Math.round(Number(minor) || 0) }, locale);
  return `${money(beforeMinor)} → ${money(afterMinor)}`;
}
