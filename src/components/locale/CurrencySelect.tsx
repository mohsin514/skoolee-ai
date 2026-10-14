"use client";
import { Select } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/locale/package";
import { useUiText } from "./LocaleProvider";
export function CurrencySelect({ value, onChange }: { value: string; onChange: (currency: string) => void }) {
 const t = useUiText();
 return <label className="block max-w-xs space-y-1 text-sm"><span>{t("Currency")}</span><Select className="w-full" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t("School default")}</option>{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></label>;
}
