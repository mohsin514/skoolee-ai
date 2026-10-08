"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getEffectiveDisplayLocale } from "@/app/actions/locale";
import { defaultLocale, formatMoney, formatDateOnly, type LocalePackage } from "@/lib/locale/package";
import { translateUi } from "@/lib/locale/ui-messages";
const LocaleContext = createContext<LocalePackage>(defaultLocale);
export function LocaleProvider({ children }: { children: ReactNode }) {
 const [locale, setLocale] = useState(defaultLocale);
 const reload = useCallback(() => { void getEffectiveDisplayLocale().then(setLocale).catch(() => {}); }, []);
 useEffect(() => { reload(); window.addEventListener("skoolee:locale-change", reload); return () => window.removeEventListener("skoolee:locale-change", reload); }, [reload]);
 useEffect(() => { const html = document.documentElement; const previous = { lang: html.lang, dir: html.dir }; html.lang = locale.language; html.dir = locale.language !== "en" ? "rtl" : "ltr"; return () => { html.lang = previous.lang; html.dir = previous.dir; }; }, [locale.language]);
 return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
export function useUiText() { const { language } = useLocale(); return useCallback((source: string, values: unknown[] = []) => translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => index in values ? String(values[Number(index)]) : match), [language]); }
/** Only explicit interface copy enters this component; student names and authored content do not. */
export function UiText({ children }: { children: string }) { const t = useUiText(); return t(children); }

/** Calendar/fee fields are date-only values; never reinterpret them in a time zone. */
export function useLocaleFormat() {
 const locale = useLocale();
 return {
  money: (minor: number, currency = "PKR") => formatMoney({ minor, currency }, locale),
  date: (value: string | Date | null | undefined) => value ? formatDateOnly((value instanceof Date ? value.toISOString() : value).slice(0, 10), locale) : "—",
 };
}
