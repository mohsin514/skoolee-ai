"use client";

import { SplashVisual, splashCopy } from "@/components/SplashVisual";
import { useDocumentLocale } from "@/hooks/use-document-locale";

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead).
 *
 * The visual is the shared `SplashVisual` — the exact same markup the landing `SplashScreen` and the hard-load
 * `BootSplash` render, so every loading surface in the app is identical. `setLoading` has no known duration, so the
 * stroke is shown full (progress 1) with a soft light travelling along it (`stalled`), the splash's "still working"
 * state, rather than a one-shot progress fill. It ignores the pointer so the app underneath stays usable until it is
 * dismissed.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  const t = splashCopy[language] ?? splashCopy.en;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t.loading}
      dir={dir}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto bg-background"
    >
      <SplashVisual language={language} progress={1} entrance="wake" stalled />
    </div>
  );
}
