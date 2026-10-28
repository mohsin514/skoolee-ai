"use client";

import { type CSSProperties } from "react";
import { AuthGreeting } from "@/components/auth/AuthGreeting";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { InkRule } from "@/components/auth/InkRule";
import { useDocumentLocale } from "@/hooks/use-document-locale";
import type { Language } from "@/lib/locale/package";

/** Same framework-owned copy the landing splash uses (the loader renders above page LocaleProviders). */
const copy: Record<Language, { eyebrow: string; status: string }> = {
  en: { eyebrow: "AI school management", status: "Loading SkooleeAI" },
  ar: { eyebrow: "إدارة مدرسية بالذكاء الاصطناعي", status: "جارٍ تحميل SkooleeAI" },
  ur: { eyebrow: "اے آئی اسکول مینجمنٹ", status: "SkooleeAI لوڈ ہو رہا ہے" },
};

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead).
 *
 * It mirrors the landing splash (`SplashScreen`) exactly — the live Skoolee mascot wordmark, the ink-rule stroke, the
 * time-aware greeting and the "AI school management" eyebrow, with the same `sk-enter` staggered reveal — so every
 * loading surface in the app looks identical. `setLoading` has no known duration, so the stroke is shown full with a
 * soft light travelling along it (the splash's "still working" state) rather than a one-shot progress fill.
 *
 * It is a status, not a page: the wordmark is decorative (no second <h1>), the region is announced once in the
 * reader's language, and it ignores the pointer so the app underneath stays usable until it is dismissed.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  const t = copy[language] ?? copy.en;
  const delay = (ms: number) => ({ "--sk-delay": `${ms}ms` }) as CSSProperties;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t.status}
      dir={dir}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto bg-background"
    >
      <div className="flex w-full flex-col items-center px-6 pt-6 text-center">
        {/* The one face: the same live wordmark the landing splash and login use, awake. */}
        <div className="sk-rise">
          <AuthMascot entrance="wake" size="min(3.5rem, 14vw)" rule={false} lookDuration={2} signals={{ thinking: true }} />
        </div>

        {/* The ink swash, shown full with a light travelling along it while the operation is in flight. */}
        <div className="sk-enter" style={delay(90)}>
          <div className="relative mt-4 w-[min(220px,64vw)]" aria-hidden="true">
            <InkRule width="100%" className="absolute inset-x-0 top-0 opacity-15" />
            <InkRule progress={1} width="100%" className="relative block" />
            <span className="sk-shimmer pointer-events-none absolute -inset-y-2 start-0 w-1/2 bg-radial from-white/85 to-transparent to-70% rtl:-scale-x-100 motion-reduce:hidden" />
          </div>
        </div>

        <div className="sk-enter mt-7" style={delay(160)} aria-hidden="true">
          <AuthGreeting language={language} className="text-center text-lg font-semibold text-balance text-ink-strong" />
          <p className="sk-eyebrow mt-1.5 text-primary">{t.eyebrow}</p>
        </div>
      </div>
    </div>
  );
}
