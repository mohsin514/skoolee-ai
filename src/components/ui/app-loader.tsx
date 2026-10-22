"use client";

import { GraduationCap } from "lucide-react";
import styles from "@/components/SplashScreen.module.css";
import { useDocumentLocale } from "@/hooks/use-document-locale";

/** Framework-owned copy (like overlay-messages): the loader renders above page LocaleProviders. */
const labels = {
  en: { status: "Loading SkooleeAI", working: "Processing…" },
  ar: { status: "جارٍ تحميل SkooleeAI", working: "جارٍ المعالجة…" },
  ur: { status: "SkooleeAI لوڈ ہو رہا ہے", working: "کارروائی جاری ہے…" },
} as const;

/**
 * The full-screen brand loader `setLoading(true)` shows for a long client-side operation with nothing to render yet
 * (route changes use the layout-shaped skeletons instead). It is a status, not a page: the wordmark is decorative (no
 * second <h1>), the region is announced once in the reader's language, and the shimmer uses the brand token.
 */
export function AppLoaderUI() {
  const { language, dir } = useDocumentLocale();
  const copy = labels[language] ?? labels.en;
  return (
    <div
      className={styles.splashContainer}
      style={{ animation: "none" }}
      role="status"
      aria-live="polite"
      aria-label={copy.status}
      dir={dir}
    >
      <div className={styles.contentWrapper} style={{ animation: "none" }}>
        <div className={styles.logoContainer}>
          <div className={styles.logoText} aria-hidden="true" dir="ltr">
            <span className={styles.letter}>S</span>
            <span className={styles.letter}>k</span>
            <div className={styles.capWrapper}>
              <GraduationCap className={styles.graduationCap} strokeWidth={2.5} />
              <div className={styles.eye}>
                <div className={styles.pupil} style={{ animationDuration: "2s" }} />
              </div>
            </div>
            <div className={styles.eye}>
              <div className={styles.pupil} style={{ animationDuration: "2s" }} />
            </div>
            <span className={styles.letter}>l</span>
            <span className={styles.letter}>e</span>
            <span className={styles.letter}>e</span>
            <span className={styles.ai}>AI</span>
          </div>
          <p className={styles.tagline}>{copy.working}</p>
        </div>

        <div className={styles.loaderWrapper} aria-hidden="true">
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: "100%",
                background: "linear-gradient(90deg, transparent, var(--brand-500), transparent)",
                backgroundSize: "200% 100%",
                animationName: "sk-app-loader-shimmer",
                animationDuration: "1.5s",
                animationIterationCount: "infinite",
                animationTimingFunction: "linear",
              }}
            />
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sk-app-loader-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="progressFill"] { animation: none !important; }
        }
      ` }} />
    </div>
  );
}
