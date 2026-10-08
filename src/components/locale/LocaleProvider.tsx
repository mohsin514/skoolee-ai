"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getEffectiveDisplayLocale } from "@/app/actions/locale";
import { defaultLocale, type LocalePackage } from "@/lib/locale/package";
import { translateUi } from "@/lib/locale/ui-messages";
const LocaleContext = createContext<LocalePackage>(defaultLocale);
export function LocaleProvider({ children }: { children: ReactNode }) {
 const [locale, setLocale] = useState(defaultLocale);
 const reload = useCallback(() => { void getEffectiveDisplayLocale().then(setLocale).catch(() => {}); }, []);
 useEffect(() => { reload(); window.addEventListener("skoolee:locale-change", reload); return () => window.removeEventListener("skoolee:locale-change", reload); }, [reload]);
 useEffect(() => { const html = document.documentElement; const previous = { lang: html.lang, dir: html.dir }; html.lang = locale.language; html.dir = locale.language === "ar" ? "rtl" : "ltr"; return () => { html.lang = previous.lang; html.dir = previous.dir; }; }, [locale.language]);
 return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale() { return useContext(LocaleContext); }
export function useUiText() { const { language } = useLocale(); return useCallback((source: string) => translateUi(source, language), [language]); }
/** Only explicit interface copy enters this component; student names and authored content do not. */
export function UiText({ children }: { children: string }) { const t = useUiText(); return t(children); }
