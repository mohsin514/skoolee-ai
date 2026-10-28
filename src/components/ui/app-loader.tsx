"use client";

import { AuthMascot } from "@/components/auth/AuthMascot";
import { InkRule } from "@/components/auth/InkRule";
import { useDocumentLocale } from "@/hooks/use-document-locale";

/** Framework-owned copy (like overlay-messages): the loader renders above page LocaleProviders. */
const labels = {
  en: { status: "Loading SkooleeAI" },
  ar: { status: "جارٍ تحميل SkooleeAI" },
  ur: { status: "SkooleeAI لوڈ ہو رہا ہے" },
} as const;

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead).
 *
 * This is now the SAME beat the splash screen uses (SplashScreen / BootSplash): the live Skoolee mascot wordmark over
 * the hand-pulled ink-rule stroke, instead of the old GraduationCap + SplashScreen.module.css loader. `setLoading` has
 * no known duration, so the stroke is shown full with a soft light travelling along it (the splash's "still working"
 * state) rather than a one-shot progress fill. It is a status, not a page: the wordmark is decorative (no second
 * <h1>), the region is announced once in the reader's language, and it ignores the pointer so the app underneath stays
 * usable until it is dismissed.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  const copy = labels[language] ?? labels.en;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={copy.status}
      dir={dir}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-background"
    >
      <div className="flex flex-col items-center px-6 pt-6 text-center">
        {/* The one face: the same live wordmark the splash and login use, awake. */}
        <div className="sk-rise">
          <AuthMascot entrance="wake" size="min(3.5rem, 14vw)" rule={false} lookDuration={2} signals={{ thinking: true }} />
        </div>

        {/* The ink swash, shown full with a light travelling along it while the operation is in flight. */}
        <div className="relative mt-4 w-[min(220px,64vw)]" aria-hidden="true">
          <InkRule width="100%" className="absolute inset-x-0 top-0 opacity-15" />
          <InkRule progress={1} width="100%" className="relative block" />
          <span className="sk-shimmer pointer-events-none absolute -inset-y-2 start-0 w-1/2 bg-radial from-white/85 to-transparent to-70% rtl:-scale-x-100 motion-reduce:hidden" />
        </div>
      </div>
    </div>
  );
}
