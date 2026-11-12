"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getEffectiveDisplayLocale } from "@/app/actions/locale";
import { defaultLocale, formatMoney, formatDateOnly, formatInstant, localeTag, type LocalePackage } from "@/lib/locale/package-core";
import { loadUiCatalog, translateUi, type UiCatalogScope } from "@/lib/locale/ui-translate";
import { UiCatalogGate } from "./UiCatalogGate";
const LocaleContext = createContext<LocalePackage | null>(null);
/** `initialLocale` is server-resolved by the shell layout so first paint is already in the right language/direction. */
export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: LocalePackage }) {
 const inherited = useContext(LocaleContext);
 return inherited ? <>{children}</> : <LocaleRoot initialLocale={initialLocale}>{children}</LocaleRoot>;
}
/** A fixed locale with no fetch and no `<html>` effect (pre-login pages own those). Nested `LocaleProvider`s become passthroughs. */
export function StaticLocaleProvider({ value, catalogScope, children }: { value: LocalePackage; catalogScope?: UiCatalogScope; children: ReactNode }) {
 return <LocaleContext.Provider value={value}><UiCatalogGate language={value.language} scope={catalogScope}>{children}</UiCatalogGate></LocaleContext.Provider>;
}
function LocaleRoot({ children, initialLocale }: { children: ReactNode; initialLocale?: LocalePackage }) {
 const [locale, setLocale] = useState(initialLocale ?? defaultLocale);
 const seeded = Boolean(initialLocale);
 // SKAI-1004: fetch the AR/UR catalog before switching, so the gate never blanks the page.
 const reload = useCallback(() => { void getEffectiveDisplayLocale().then(async (next) => { await loadUiCatalog(next.language); setLocale(next); }).catch(() => {}); }, []);
 useEffect(() => { if (!seeded) reload(); window.addEventListener("skoolee:locale-change", reload); return () => window.removeEventListener("skoolee:locale-change", reload); }, [reload, seeded]);
 useEffect(() => { const html = document.documentElement; const previous = { lang: html.lang, dir: html.dir }; html.lang = locale.language; html.dir = locale.language !== "en" ? "rtl" : "ltr"; return () => { html.lang = previous.lang; html.dir = previous.dir; }; }, [locale.language]);
 return <LocaleContext.Provider value={locale}><div lang={locale.language} dir={locale.language !== "en" ? "rtl" : "ltr"} className="contents"><UiCatalogGate language={locale.language}>{children}</UiCatalogGate></div></LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext) ?? defaultLocale; }
export function useUiText() { const { language } = useLocale(); return useCallback((source: string, values: unknown[] = []) => translateUi(source, language).replace(/\{(\d+)\}/g, (match, index) => index in values ? String(values[Number(index)]) : match), [language]); }
/** Only explicit interface copy enters this component; student names and authored content do not. */
export function UiText({ children }: { children: string }) { const t = useUiText(); return <> {t(children)} </>; }

/** Calendar/fee fields are date-only values; never reinterpret them in a time zone.
 *  Stable per locale: callers may list these formatters in hook dependencies without re-running every render. */
export function useLocaleFormat() {
 const locale = useLocale();
 return useMemo(() => ({
  money: (minor: number, currency = "PKR") => formatMoney({ minor, currency }, locale),
  date: (value: string | Date | null | undefined) => value ? formatDateOnly((value instanceof Date ? value.toISOString() : value).slice(0, 10), locale) : "—",
  // Date and time in the school's timezone and language (SKO-466 visitor arrivals and departures).
  dateTime: (value: string | Date | null | undefined) => value ? formatInstant(value, locale) : "—",
  // Plain numbers in the school's numbering system (SKO-461 evidence values).
  number: (value: number, maximumFractionDigits = 1) => new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits }).format(value),
 }), [locale]);
}
