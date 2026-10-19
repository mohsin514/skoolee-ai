"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { directionFor } from "@/lib/locale/language-cookie";
import type { Language } from "@/lib/locale/package";

/**
 * The one layout for every auth screen. `split` / `split-wide` put the ink
 * cover (lg+ only) beside the desk; `center` is a single column. The column
 * is the ONLY direct child of the desk section (the login pin depends on it).
 * MotionConfig makes every framer one-shot respect reduced motion.
 * Print keeps only the desk's content (protect-account prints recovery codes):
 * no cover, top bar or colophon, and no desk padding.
 *
 * `studio` (the /onboarding setup desk) is the split layout with a compact
 * "charter" cover that is purely decorative (aria-hidden: it repeats the
 * owner's own answers) and a wide, top-aligned column. The step card's h1 is
 * the page's only h1, so `srHeading` is not rendered there.
 */
export type AuthShellProps = {
  language: Language;
  layout?: "split" | "split-wide" | "center" | "studio";   // default "split"
  cover?: ReactNode;                             // ignored when layout === "center"
  srHeading?: string;                            // sr-only <h1>, visible to AT only below lg (split layouts; not studio)
  topBar?: ReactNode;                            // <AuthTopBar …/>; omitted only where the language is not chosen here (teacher onboarding follows the signed-in user's)
  footer?: ReactNode;                            // <AuthColophon …/> or a page footer
  /** Column width override; `center` + "studio" is the setup desk without its cover (the package chooser). */
  width?: "narrow" | "wide" | "studio";
  children: ReactNode;
};

export function AuthShell({ language, layout = "split", cover, srHeading, topBar, footer, width, children }: AuthShellProps) {
  const split = layout !== "center";
  const studio = layout === "studio";
  return (
    <MotionConfig reducedMotion="user">
      <main lang={language} dir={directionFor(language)} data-layout={layout} className="sk-auth sk-shell font-sans print:block print:min-h-0">
        {split ? (
          <section
            className="sk-auth-cover print:hidden"
            data-size={layout === "split-wide" || studio ? "compact" : undefined}
            data-variant={studio ? "charter" : undefined}
            aria-hidden={studio ? "true" : undefined}
          >{cover}</section>
        ) : null}
        <section className="sk-auth-desk print:min-h-0 print:p-0">
          <div className="sk-auth-column sk-shell" data-width={width ?? (studio ? "studio" : layout === "split-wide" ? "wide" : "narrow")}>
            {srHeading && !studio ? <h1 className="sr-only lg:hidden">{srHeading}</h1> : null}
            {topBar}
            {children}
            {footer}
          </div>
        </section>
      </main>
    </MotionConfig>
  );
}
