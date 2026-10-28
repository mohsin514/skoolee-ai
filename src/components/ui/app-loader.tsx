"use client";

import { SplashVisual } from "@/components/SplashVisual";
import { useDocumentLocale } from "@/hooks/use-document-locale";

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead).
 *
 * The visual is the shared `SplashVisual` — the exact same markup the landing `SplashScreen` and the hard-load
 * `BootSplash` render, so every loading surface in the app is identical, down to the mascot's eyes. `setLoading` has
 * no known duration, so the ink stroke is simply shown full (progress 1); the mascot stays in the same idle gaze as
 * the other two surfaces (no `thinking` signal, no travelling light), so the eyes do not look different here. It
 * ignores the pointer so the app underneath stays usable until it is dismissed.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  // SplashVisual renders the single sr-only role="status" announcement itself, so the
  // overlay wrapper stays a plain decorative container (no nested status region).
  return (
    <div
      dir={dir}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto sk-splash-surface"
    >
      <SplashVisual language={language} progress={1} entrance="wake" />
    </div>
  );
}
