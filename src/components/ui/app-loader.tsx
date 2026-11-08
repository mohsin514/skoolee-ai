"use client";

import SplashScreen from "@/components/SplashScreen";
import { useDocumentLocale } from "@/hooks/use-document-locale";

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead).
 *
 * It renders the ONE `SplashScreen` in `hold` mode — the exact same splash design as first landing and a hard reload,
 * so there is a single splash design across the whole app. There is no `onDone`, so the beat holds while the operation
 * runs; the provider unmounts it when `setLoading(false)` fires. It ignores the pointer so the app underneath stays
 * usable until it is dismissed.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  return (
    <div
      role="dialog"
      aria-label="Loading Skoolee AI"
      aria-hidden="true"
      dir={dir}
      className="pointer-events-none fixed inset-0 z-[9999] flex items-center-safe justify-center overflow-x-hidden overflow-y-auto sk-splash-surface"
    >
      <SplashScreen language={language} mode="hold" />
    </div>
  );
}
