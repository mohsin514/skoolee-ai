"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { StaticLocaleProvider } from "@/components/locale/LocaleProvider";
import { defaultLocale, type Language } from "@/lib/locale/package";
import { EXPLICIT_LANGUAGE_KEY, directionFor, readLanguageCookieClient, writeLanguageCookieClient } from "@/lib/locale/language-cookie";

export type SignInLanguage = { language: Language; languageSource: "explicit" | "cookie" } | Record<string, never>;

type AuthLanguage = {
  language: Language;
  /** A choice made on an auth page: writes the cookie and marks it explicit for this tab. */
  setLanguage: (lang: Language) => void;
  /** Spread into every session-issuing auth POST body (design §B.1.2). */
  signInLanguage: () => SignInLanguage;
  /** Call only after a response that issued a real session: `json.success === true && !json.mfaRequired`. */
  clearExplicit: () => void;
};

const AuthLanguageContext = createContext<AuthLanguage | null>(null);

function explicitFlag() {
  try { return window.sessionStorage.getItem(EXPLICIT_LANGUAGE_KEY) === "1"; } catch { return false; }
}

/** Pre-login language: seeded server-side from the `skoolee-lang` cookie by the (auth) layout. */
export function AuthLocaleProvider({ initialLanguage, children }: { initialLanguage: Language; children: ReactNode }) {
  const [language, setState] = useState<Language>(initialLanguage);

  // No restore on unmount: the post-login LocaleRoot takes over <html>, and restoring would flash.
  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = directionFor(language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    writeLanguageCookieClient(lang);
    try { window.sessionStorage.setItem(EXPLICIT_LANGUAGE_KEY, "1"); } catch { /* storage blocked: the cookie still carries it */ }
    setState(lang);
  }, []);

  const signInLanguage = useCallback((): SignInLanguage => {
    if (explicitFlag()) return { language, languageSource: "explicit" };
    const cookie = readLanguageCookieClient();
    return cookie ? { language: cookie, languageSource: "cookie" } : {};
  }, [language]);

  const clearExplicit = useCallback(() => {
    try { window.sessionStorage.removeItem(EXPLICIT_LANGUAGE_KEY); } catch { /* nothing to clear */ }
  }, []);

  const value = useMemo(() => ({ language, setLanguage, signInLanguage, clearExplicit }), [language, setLanguage, signInLanguage, clearExplicit]);
  const locale = useMemo(() => ({ ...defaultLocale, language }), [language]);

  return (
    <AuthLanguageContext.Provider value={value}>
      <div lang={language} dir={directionFor(language)} className="contents">
        <StaticLocaleProvider value={locale}>{children}</StaticLocaleProvider>
      </div>
    </AuthLanguageContext.Provider>
  );
}

export function useAuthLanguage(): AuthLanguage {
  const value = useContext(AuthLanguageContext);
  if (!value) throw new Error("useAuthLanguage must be used inside <AuthLocaleProvider>");
  return value;
}
