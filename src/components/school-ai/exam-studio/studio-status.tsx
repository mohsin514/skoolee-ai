import type { LucideIcon } from "lucide-react";
import { CircleCheckBig, CloudAlert, CloudCheck, CloudOff, DoorOpen, Eye, FileSearch, GitCompareArrows, History, Info, LoaderCircle, Lock, Minus, OctagonAlert, SquarePen, Wrench } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { TaskStatus } from "@/components/ui/task-patterns";
import { studioStatusLabel, type StudioStatusToken } from "@/lib/school-ai/exam-studio-copy";
import type { Language } from "@/lib/locale/package";
import { cn } from "@/lib/utils";

/**
 * The single Exam Studio status vocabulary (R21.1, R23.9).
 *
 * Sixteen tokens, the same sixteen words in all seven spaces. Each one renders **a word and an
 * icon as well as a colour**, so no state is ever carried by colour alone (R23.9): the word is real
 * text a screen reader reads, the icon is unique per token and decorative, and the colour is the
 * third, redundant channel. `NOT_MEASURED` is the vocabulary's stand-in for a figure that was never
 * measured (R1.5) and the word an empty panel uses to say a number is absent rather than zero
 * (R24.1).
 *
 * **Server or Client?** Neither directive is needed, and that is deliberate. Per
 * `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, a
 * Client Component is for state, event handlers, lifecycle, browser APIs and custom hooks — this
 * component has none of them. Marking it `"use client"` would do two bad things: it would drag the
 * whole vocabulary into the client bundle at every call site, and, because that directive is a
 * module-graph boundary, it would make the vocabulary unusable from the two paths that must render
 * on the server — the print output of a Released_Form (R22.6) and the Candidate's Attempt_Receipt
 * (R22.10). So the file stays directive-free and hook-free: it renders in a Server Component, and a
 * Client Component that imports it simply compiles it into its own bundle.
 *
 * The one consequence is that `language` is a prop rather than a `useLocale()` read. A client caller
 * resolves it once per surface — `const { language } = useLocale()` from
 * `src/components/locale/LocaleProvider.tsx` — and a server caller passes the recorded language of
 * the reader. Making it required rather than defaulting to English means an Arabic or Urdu surface
 * cannot silently fall back to an English state word (R22.1).
 *
 * **Nothing new is introduced** (R21.3). Geometry and type come from the shared `Badge` and
 * `TaskStatus`; icons come from `lucide-react`, already a dependency; every colour is an existing
 * token or an existing `Badge` variant (R21.2); no font is touched. Styling is Tailwind utility
 * classes over those tokens, which is what
 * `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` recommends for component
 * styling, so this file adds no stylesheet and no CSS-ordering dependency.
 */

/**
 * Six meanings, five colour treatments. Colour cannot be unique per token — sixteen hues would be
 * confetti, and `module-tones.ts` reserves the brand violet for primary actions and active
 * navigation (R21.7) — so colour groups by what the reader must *do*, and the word plus icon
 * separates the tokens inside a group.
 */
export type StudioStatusFamily =
  /** Recorded; nothing is owed and nothing is finished. */
  | "neutral"
  /** A person is now the next step. */
  | "review"
  /** Good, done, reversible. */
  | "settled"
  /** Good, done, immutable — the strongest state in the vocabulary. */
  | "sealed"
  /** Something is owed before this can move on. */
  | "attention"
  /** This stops the next step outright. */
  | "blocked";

/**
 * Only audited pairs. The `Badge` `success`/`warning`/`destructive` variants are deliberately
 * unused here: `component-contracts.md` flags their contrast as unaudited, and emerald-600,
 * amber-600 and white-on-rose-500 all fall below 4.5:1 at the badge's 12px. These five instead use
 * the status pairs recorded in `tokens-and-styles.md` (`#854d0e` on `#fffbeb`, `#7f1d1d` on
 * `#fef2f2`), the existing `--success` token, the existing `secondary` variant (`#8127cf` on
 * `#fbf0fe`) and the existing subtle surface, all of which clear AA for normal text.
 */
const FAMILY_BADGE: Record<StudioStatusFamily, { variant: BadgeProps["variant"]; className?: string }> = {
  neutral: { variant: "outline", className: "border-border-subtle bg-surface-subtle text-ink" },
  review: { variant: "secondary" },
  settled: { variant: "outline", className: "border-success/30 bg-success/10 text-success" },
  sealed: { variant: "outline", className: "border-transparent bg-success text-white shadow-sm" },
  attention: { variant: "outline", className: "border-status-warning-border bg-status-warning-surface text-status-warning-text" },
  blocked: { variant: "outline", className: "border-status-error-border bg-status-error-surface text-status-error-text" },
};

/** `TaskStatus` offers one neutral pill and one `attention` pill; the word and icon carry the rest. */
const FAMILY_NEEDS_ATTENTION: Record<StudioStatusFamily, boolean> = { neutral: false, review: false, settled: false, sealed: false, attention: true, blocked: true };

/**
 * One icon per token, never shared, so the icon alone distinguishes two tokens of the same family —
 * `APPROVED` from `SEALED`, `BLOCKING` from `SAVE_FAILED`. A `Record` keyed by the token union makes
 * a missing or stale token a TypeScript error rather than a runtime blank.
 */
const STATUS_ICON: Record<StudioStatusToken, LucideIcon> = {
  DRAFT: SquarePen, NEEDS_SOURCE: FileSearch, NEEDS_CORRECTION: Wrench, READY_FOR_REVIEW: Eye,
  APPROVED: CircleCheckBig, CHANGED_AFTER_APPROVAL: GitCompareArrows, STALE: History,
  BLOCKING: OctagonAlert, ADVISORY: Info, SEALED: Lock, SAVED: CloudCheck, SAVING: LoaderCircle,
  UNSAVED: CloudAlert, SAVE_FAILED: CloudOff, GATE_OPEN: DoorOpen, NOT_MEASURED: Minus,
};

/** Exported so a later space orders blockers above advisories without re-deriving severity. */
export const STUDIO_STATUS_FAMILY: Record<StudioStatusToken, StudioStatusFamily> = {
  DRAFT: "neutral", NEEDS_SOURCE: "attention", NEEDS_CORRECTION: "attention", READY_FOR_REVIEW: "review",
  APPROVED: "settled", CHANGED_AFTER_APPROVAL: "attention", STALE: "attention", BLOCKING: "blocked",
  ADVISORY: "neutral", SEALED: "sealed", SAVED: "settled", SAVING: "neutral", UNSAVED: "attention",
  SAVE_FAILED: "blocked", GATE_OPEN: "attention", NOT_MEASURED: "neutral",
};

export interface StudioStatusProps {
  token: StudioStatusToken;
  /** The reader's recorded language. Client callers read it once from `useLocale()`. */
  language: Language;
  /**
   * `badge` is the inline pill for a list row, table cell or item header. `task` is the
   * surface-level "state of this space" pill, reusing the shared `TaskStatus`.
   */
  presentation?: "badge" | "task";
  className?: string;
}

export function StudioStatus({ token, language, presentation = "badge", className }: StudioStatusProps) {
  const family = STUDIO_STATUS_FAMILY[token];
  const word = studioStatusLabel(token, language);
  const Icon = STATUS_ICON[token];
  // Decorative: the adjacent word already names the state. The spinner is the vocabulary's only
  // motion, and `motion-safe:` removes it under a reduced-motion preference (R21.8).
  const icon = <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", token === "SAVING" && "motion-safe:animate-spin")} />;
  // Icon before word in DOM order, laid out by a flex row, so the pair follows the document
  // direction: icon-then-word in English, word-then-icon in Arabic and Urdu. Spacing is `gap`, never
  // a physical margin, and the label is allowed to wrap so a longer Arabic or Urdu word cannot
  // overflow a 320px column.
  if (presentation === "task") return <TaskStatus attention={FAMILY_NEEDS_ATTENTION[family]}>
    <span data-studio-status={token} className={cn("inline-flex items-center gap-1.5", className)}>{icon}{word}</span>
  </TaskStatus>;
  const look = FAMILY_BADGE[family];
  return <Badge variant={look.variant} data-studio-status={token} className={cn("gap-1.5 align-middle", look.className, className)}>{icon}{word}</Badge>;
}
