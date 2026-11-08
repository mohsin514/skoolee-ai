import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { studioShellSpaceCopy, type StudioShellCopy } from "@/lib/school-ai/exam-studio-copy-shell";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import type { StudioAction } from "@/lib/school-ai/studio-access";
import type { Language } from "@/lib/locale/package";
import { StudioStatus } from "./studio-status";
import styles from "./studio-shell.module.css";

/**
 * The one interface-state union for every Exam Studio space (Requirement 24).
 *
 * Requirement 24 is eleven criteria about what a surface must say when it is empty, loading, partly
 * done, failed, forbidden, disconnected or recovered. Seven spaces each answering that separately
 * would mean seven chances to forget one, so the shell owns a single discriminated union and the
 * renderer below is the only place those states are drawn. A space that adds a variant it does not
 * handle is a TypeScript error at the `switch`, not a blank panel on a teacher's screen.
 *
 * **Server or Client?** Directive-free on purpose. Per
 * `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` a
 * Client Component is for state, event handlers, lifecycle and browser APIs; this file has none —
 * `retry` arrives already bound from whichever component owns the state. Staying directive-free
 * keeps the union usable from a server-rendered path (the print output of R22.6) and keeps the
 * `"use client"` boundary where it belongs, in the shell. `language` is therefore a prop, resolved
 * once per surface by the client caller from `useLocale()`.
 *
 * Styling is Tailwind utilities over the existing tokens plus the shell's CSS module, which is what
 * `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` recommends: utilities for
 * component styling, a module only for the geometry that utilities cannot express.
 */
export type SpaceState<T> =
  /** R24.2 — the existing skeleton, echoing the shape that is about to arrive. */
  | { kind: "loading" }
  /** R24.1 — names the next action rather than saying "nothing here". */
  | { kind: "empty"; nextAction: StudioAction }
  | { kind: "ready"; data: T }
  /** R24.3 — some named targets succeeded and others did not; every one is reported. */
  | { kind: "partial"; data: T; outcomes: readonly SpaceOutcome[] }
  /** R24.4, R24.10 — the specific reason, the entered input retained, and a retry. */
  | { kind: "error"; reason: string; retry: () => void; retained?: readonly SpaceRetainedField[] }
  /** R24.5 — names the permission required and carries no restricted data. */
  | { kind: "permission"; required: StudioAction }
  /** R24.6 — the time of the last successful exchange, so "stale" is never presented as "live". */
  | { kind: "reconnecting"; lastExchangeAt: string | null }
  /** R24.7 — the restored revision sequence and any input the server refused. */
  | { kind: "recovered"; restoredSequence: number; refused: readonly string[] };

/** R24.3. One named target and what actually happened to it. */
export interface SpaceOutcome {
  /** A stable identifier, never shown to the reader. */
  target: string;
  /** The reader-facing name, already translated by the caller. */
  label: string;
  outcome: "APPLIED" | "PENDING" | "REFUSED";
  /** Already translated; a server-reported reason is passed through unchanged and isolated. */
  detail?: string;
}

/**
 * R24.4. What the reader typed, kept across the failure. The value is echoed verbatim inside
 * `<bdi dir="auto">` because it may be a record identifier or authored text, which R22.3 forbids
 * translating and R22.4 requires isolating from the surrounding direction.
 */
export interface SpaceRetainedField {
  label: string;
  value: string;
}

/** Interface words for a `StudioAction`, so the matrix's identifiers never reach the screen. */
const ACTION_COPY: Partial<Record<StudioAction, keyof StudioShellCopy>> = {
  AUTHOR_ITEM: "actionAuthorItem",
  RUN_REHEARSAL: "actionRunRehearsal",
  APPROVE_VERSION: "actionApproveVersion",
  READ_ACTIVE_ATTEMPT: "actionReadActiveAttempt",
  READ_UNRELEASED_RESULT: "actionReadUnreleasedResult",
};

/**
 * The action in words. An action with no entry yet falls back to the authoring words rather than
 * printing `READ_SIGNAL` at a teacher: R22.3 keeps a server code out of translated copy, and the
 * copy sweep in `exam-studio-locale.test.ts` refuses an identifier inside a message.
 */
export function studioActionWords(action: StudioAction, language: Language): string {
  const copy = studioShellSpaceCopy(language);
  return copy[ACTION_COPY[action] ?? "actionAuthorItem"];
}

/** R22.4. Authored text, identifiers, maths and code keep their own direction inside either shell. */
export function Isolated({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="auto" className={className}>{children}</bdi>;
}

/**
 * R22.9 for a message whose parts are nodes rather than strings.
 *
 * `fillStudioCopy` is the right tool when every part is text. When a part must be a `<bdi>` — an
 * identifier, a refused value, authored text — the alternative is appending a translated fragment
 * to a node, which is the concatenation the requirement forbids: Arabic and Urdu could no longer
 * move that part through the sentence. This substitutes the same numbered placeholders by index and
 * keeps the translation's own word order, so `"{0} من {1}"` renders its parts where Arabic puts
 * them.
 */
export function Composed({ template, values }: { template: string; values: readonly ReactNode[] }) {
  return <>{template.split(/(\{\d+\})/).map((part, index) => {
    const slot = /^\{(\d+)\}$/.exec(part);
    const key = `${index}:${part}`;
    if (!slot) return <Fragment key={key}>{part}</Fragment>;
    const value = values[Number(slot[1])];
    return <Fragment key={key}>{value === undefined ? part : value}</Fragment>;
  })}</>;
}

export interface SpaceStateRegionProps<T> {
  state: SpaceState<T>;
  language: Language;
  /** Rendered for `ready` and `partial`; `partial` adds the per-target outcome list above it. */
  children: (data: T) => ReactNode;
  /** Echoes the shape of the content, so the panel does not jump when data lands. */
  loadingRows?: number;
}

/**
 * Draws whichever state the space is in. Every one of the eight variants is handled here, and
 * `partial` deliberately renders the data *and* the outcomes: a bulk action that half worked must
 * still show what did work (R24.3).
 */
export function SpaceStateRegion<T>({ state, language, children, loadingRows = 3 }: SpaceStateRegionProps<T>) {
  const t = studioShellSpaceCopy(language);
  switch (state.kind) {
    case "loading":
      // R24.2. `role="status"` with `aria-busy` announces the wait once; the bars are decoration.
      return <div role="status" aria-busy="true" className={styles.stateRegion} data-space-state="loading">
        <span className="sr-only">{t.loadingLabel}</span>
        <StudioStatus token="SAVING" language={language} presentation="task" />
        <Skeleton className="h-7 w-2/5" />
        {Array.from({ length: loadingRows }, (_unused, row) => <Skeleton key={row} className="h-14 w-full" delay={row * 60} />)}
      </div>;

    case "empty":
      // R24.1. The next action, named, instead of an apology.
      return <div data-space-state="empty"><TaskFeedback kind="empty" title={t.emptyTitle}>
        <p>{fillStudioCopy(t.emptyBody, [studioActionWords(state.nextAction, language)])}</p>
      </TaskFeedback></div>;

    case "ready":
      return <div data-space-state="ready">{children(state.data)}</div>;

    case "partial":
      return <div data-space-state="partial" className={styles.stateRegion}>
        <section aria-labelledby="studio-partial-outcomes" className={styles.outcomes}>
          <h3 id="studio-partial-outcomes" className={styles.outcomeHeading}>{t.partialTitle}</h3>
          <ul>
            {state.outcomes.map((outcome) => <li key={outcome.target} className={styles.outcome} data-outcome={outcome.outcome}>
              <Isolated className={styles.outcomeLabel}>{outcome.label}</Isolated>
              <StudioStatus token={outcome.outcome === "APPLIED" ? "APPROVED" : outcome.outcome === "PENDING" ? "NOT_MEASURED" : "BLOCKING"} language={language} />
              <span className={styles.outcomeDetail}>{outcome.detail ?? (outcome.outcome === "APPLIED" ? t.outcomeReady : t.outcomePending)}</span>
            </li>)}
          </ul>
        </section>
        {children(state.data)}
      </div>;

    case "error":
      // R24.4 and R24.10: the specific reason, the entered input kept and echoed, a retry, and no
      // stack trace, database text or file path — the caller passes a bounded server reason only.
      return <div data-space-state="error"><TaskFeedback kind="error" title={t.errorTitle}
        action={<Button variant="outline" onClick={state.retry}>{t.retry}</Button>}>
        <p><Isolated>{state.reason}</Isolated></p>
        {state.retained?.length ? <p className="mt-2"><Composed template={t.retained} values={[
          <>{state.retained.map((field, index) => <Fragment key={field.label}>{index > 0 ? ", " : ""}{field.label}: <Isolated>{field.value}</Isolated></Fragment>)}</>,
        ]} /></p> : null}
      </TaskFeedback></div>;

    case "permission":
      // R24.5. The permission is named; nothing restricted is in this branch to leak.
      return <div data-space-state="permission"><TaskFeedback kind="permission" title={t.permissionTitle}>
        <p>{fillStudioCopy(t.permissionBody, [studioActionWords(state.required, language)])}</p>
      </TaskFeedback></div>;

    case "reconnecting":
      // R24.6. The last successful exchange is stated, so no value here can read as live.
      return <div data-space-state="reconnecting" role="status" className={styles.stateRegion}>
        <StudioStatus token="SAVING" language={language} presentation="task" />
        <h3 className={styles.outcomeHeading}>{t.reconnectTitle}</h3>
        <p className={styles.outcomeDetail}>{state.lastExchangeAt
          ? fillStudioCopy(t.reconnectBody, [new Intl.DateTimeFormat(language, { timeStyle: "medium" }).format(new Date(state.lastExchangeAt))])
          : t.reconnectNever}</p>
      </div>;

    case "recovered":
      // R24.7. The restored revision sequence, and every input the server refused, named.
      return <div data-space-state="recovered" role="status" className={styles.stateRegion}>
        <StudioStatus token="SAVED" language={language} presentation="task" />
        <h3 className={styles.outcomeHeading}>{t.recoveredTitle}</h3>
        <p className={styles.outcomeDetail}>{fillStudioCopy(t.recoveredBody, [new Intl.NumberFormat(language).format(state.restoredSequence)])}</p>
        <p className={styles.outcomeDetail}>{state.refused.length
          ? <Composed template={t.recoveredRefused} values={[<Isolated key="refused">{state.refused.join(", ")}</Isolated>]} />
          : t.recoveredClean}</p>
      </div>;
  }
}
