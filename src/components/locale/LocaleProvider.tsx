"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getEffectiveDisplayLocale } from "@/app/actions/locale";
import { defaultLocale, formatMoney, formatDateOnly, formatInstant, type LocalePackage } from "@/lib/locale/package";
import { translateUi } from "@/lib/locale/ui-messages";
const LocaleContext = createContext<LocalePackage | null>(null);
/** `initialLocale` is server-resolved by the shell layout so first paint is already in the right language/direction. */
export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: LocalePackage }) {
 const inherited = useContext(LocaleContext);
 return inherited ? <>{children}</> : <LocaleRoot initialLocale={initialLocale}>{children}</LocaleRoot>;
}
/** A fixed locale with no fetch and no `<html>` effect (pre-login pages own those). Nested `LocaleProvider`s become passthroughs. */
export function StaticLocaleProvider({ value, children }: { value: LocalePackage; children: ReactNode }) {
 return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
function LocaleRoot({ children, initialLocale }: { children: ReactNode; initialLocale?: LocalePackage }) {
 const [locale, setLocale] = useState(initialLocale ?? defaultLocale);
 const seeded = Boolean(initialLocale);
 const reload = useCallback(() => { void getEffectiveDisplayLocale().then(setLocale).catch(() => {}); }, []);
 useEffect(() => { if (!seeded) reload(); window.addEventListener("skoolee:locale-change", reload); return () => window.removeEventListener("skoolee:locale-change", reload); }, [reload, seeded]);
 useEffect(() => { const html = document.documentElement; const previous = { lang: html.lang, dir: html.dir }; html.lang = locale.language; html.dir = locale.language !== "en" ? "rtl" : "ltr"; return () => { html.lang = previous.lang; html.dir = previous.dir; }; }, [locale.language]);
 return <LocaleContext.Provider value={locale}><div lang={locale.language} dir={locale.language !== "en" ? "rtl" : "ltr"} className="contents">{children}</div></LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext) ?? defaultLocale; }
export function useUiText() { const { language } = useLocale(); return useCallback((source: string, values: unknown[] = []) => translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => index in values ? String(values[Number(index)]) : match), [language]); }
/** Only explicit interface copy enters this component; student names and authored content do not. */
export function UiText({ children }: { children: string }) { const t = useUiText(); return <> {t(children)} </>; }

/** Calendar/fee fields are date-only values; never reinterpret them in a time zone. */
export function useLocaleFormat() {
 const locale = useLocale();
 return {
  money: (minor: number, currency = "PKR") => formatMoney({ minor, currency }, locale),
  date: (value: string | Date | null | undefined) => value ? formatDateOnly((value instanceof Date ? value.toISOString() : value).slice(0, 10), locale) : "—",
  // Date and time in the school's timezone and language (SKO-466 visitor arrivals and departures).
  dateTime: (value: string | Date | null | undefined) => value ? formatInstant(value, locale) : "—",
 };
}
