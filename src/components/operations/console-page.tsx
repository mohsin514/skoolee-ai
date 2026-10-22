"use client";

import { Fragment, useId, useSyncExternalStore, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, type PageAction } from "@/components/ui/page-header";
import { SkeletonBar as SkeletonBlock } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { PageHeaderSkeleton, TileSkeleton } from "@/components/role-dashboard/RoleShellSkeleton";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { labelFor, leafForView, type ConsoleId } from "@/lib/navigation/role-nav";
import { cn } from "@/lib/utils";

/** Phone width (below Tailwind `sm`), where capture desks move their one primary action into a sticky bar. */
const PHONE_QUERY = "(max-width: 639.98px)";
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function usePhoneWidth() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/**
 * The page frame of the operations-staff consoles (Finance desk, Front desk, Library) — role-ux §4.3.
 *
 * One `PageHeader` per view: the title is the registry label verbatim, the description is the registry
 * `summary` (or the console's own one-sentence description), at most one primary action at the top-end, up to
 * two visible secondaries, persistent state in `status` and the view's tabs. The sidebar is the only section
 * navigation: the old section strip that repeated it under the header is gone, and so are the quick-link tiles
 * that repeated it again on the landing view (role-ux §4.5.8, F14).
 *
 * `captureDesk` marks the desks staff work standing up (Visitors, Collect, Lending desk, Pickup — §4.5.1): on a
 * phone their one primary action leaves the header for a sticky bar at the bottom of the content, just above the
 * mobile navigation, so it stays under the thumb while the list scrolls. It is still the only primary.
 */
export function ConsolePage({
  consoleId,
  view,
  title,
  description,
  icon,
  status,
  primaryAction,
  secondaryActions,
  tabs,
  notice,
  captureDesk = false,
  children,
  contentClassName,
}: {
  consoleId: ConsoleId;
  /** The registry view this page renders; supplies the title and summary. */
  view: string;
  /** Overrides the registry label (EN UI key). */
  title?: string;
  /** Overrides the registry summary (EN UI key; one sentence naming the decider where relevant). */
  description?: string;
  icon?: LucideIcon;
  status?: ReactNode;
  primaryAction?: PageAction;
  secondaryActions?: PageAction[];
  tabs?: ReactNode;
  /** A retired-view notice (EN UI key) from `useConsoleView().retiredNotice`, shown once above the content. */
  notice?: string | null;
  /** Capture-first desk: on a phone the primary action moves to a sticky bottom bar (role-ux §4.5.1). */
  captureDesk?: boolean;
  children: ReactNode;
  contentClassName?: string;
}) {
  const ui = useUiText();
  const access = useConsoleAccess();
  const leaf = leafForView(consoleId, view);
  const map: Record<string, boolean> = {};
  if (leaf?.labelWhen) for (const when of leaf.labelWhen) map[when.key] = access.has(when.key);
  const heading = title ?? (leaf ? labelFor(leaf, map) : view);
  const summary = description ?? leaf?.summary;
  const phone = usePhoneWidth();
  const sticky = captureDesk && phone && primaryAction && !primaryAction.href ? primaryAction : null;
  const StickyIcon = sticky?.icon;

  return (
    // Inside the shell's one page card (addendum 2026-10-22): no card of its own. On a phone the header scrolls away
    // with the content; from `sm` up it stays pinned while the content scrolls under it.
    <div className="custom-scrollbar relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden" data-console-view={view}>
      <div className={cn("shrink-0 border-b border-border-subtle", CONSOLE_GUTTER, "pb-4 pt-4 sm:pb-5 sm:pt-6")}>
        <PageHeader
          title={heading}
          description={summary}
          icon={icon}
          status={status}
          primaryAction={sticky ? undefined : primaryAction}
          secondaryActions={secondaryActions}
          tabs={tabs}
        />
      </div>
      <div className={cn("custom-scrollbar flex min-w-0 flex-1 flex-col gap-5 sm:min-h-0 sm:overflow-y-auto", CONSOLE_GUTTER, "py-4 sm:py-6", contentClassName)} data-console-content>
        {notice ? <Alert tone="info" live="polite" compact>{ui(notice)}</Alert> : null}
        {children}
        {sticky ? (
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-auto border-t border-border-subtle bg-card px-4 py-3" data-console-sticky-action>
            <Button
              type="button"
              className="w-full"
              data-tour="page.primary-action"
              loading={sticky.loading}
              aria-disabled={sticky.disabled || undefined}
              onClick={() => { if (!sticky.disabled) sticky.onClick?.(); }}
            >
              {StickyIcon && !sticky.loading ? <StickyIcon aria-hidden="true" /> : null}
              <span className="[overflow-wrap:anywhere]">{ui(sticky.label)}</span>
            </Button>
            {sticky.disabled && sticky.disabledReason ? <p className="mt-1.5 text-center text-xs text-ink-muted">{ui(sticky.disabledReason)}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal padding of the console header and content: the shell card's body gutter (`PAGE_CARD_BODY`). */
const CONSOLE_GUTTER = "px-4 sm:px-6";

/**
 * A panel's own sections when the screen already has a tab row (role-ux §3.1: tabs never nest a second level) —
 * e.g. Accounts & ledger inside the campus admin's Fees tabs. A labelled picker in the panel's toolbar, not a
 * second tab strip, so the screen keeps one set of `page.tab.*` anchors. The consoles that own the view render
 * the sections as the PageHeader's tabs instead (`sectionNav="none"` on the panel).
 */
export function SectionPicker<T extends string>({ items, value, onChange, label }: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  /** EN UI key naming what is picked ("Fee setup section"). */
  label: string;
}) {
  const ui = useUiText();
  const id = useId();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-section-picker>
      <label htmlFor={id} className="text-sm font-semibold text-ink-muted">{ui(label)}</label>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value as T)} className="w-full min-w-0 sm:w-auto sm:min-w-56">
        {items.map((item) => <option key={item.id} value={item.id}>{ui(item.label)}</option>)}
      </Select>
    </div>
  );
}

/**
 * What these consoles show while their session loads, drawn inside the shell's page card: the same PageHeader and
 * content shapes as `ConsolePage` (and the same shapes `RoleShellSkeleton` draws for the route's loading.tsx), so
 * the only thing that changes when the data lands is the content. Announced once.
 *
 * `bare` drops the console gutters for a caller that already pads its body (`RoleShellSkeleton`'s page card).
 */
export function ConsoleSkeleton({ cards = 4, label = "Loading the console", bare = false }: { cards?: number; label?: string; bare?: boolean }) {
  const ui = useUiText();
  const body = (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: Math.min(cards, 4) }).map((_, i) => <TileSkeleton key={i} delay={i * 80} className={i >= 2 ? "hidden xl:block" : undefined} />)}
      </div>
      <div aria-hidden="true" className="sk-panel space-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <SkeletonBlock className="size-9 shrink-0 rounded-xl" />
          <SkeletonBlock className="h-4 w-40 max-w-full rounded-lg" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBlock className="size-9 shrink-0 rounded-xl" delay={i * 60} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBlock className="h-3 w-1/2 rounded-full" delay={i * 60} />
              <SkeletonBlock className="h-2.5 w-1/3 rounded-full" delay={i * 60} />
            </div>
            <SkeletonBlock className="hidden h-8 w-20 shrink-0 rounded-lg sm:block" delay={i * 60} />
          </div>
        ))}
      </div>
    </div>
  );
  if (bare) return body;
  return (
    <div role="status" aria-busy="true" aria-label={ui(label)} className={cn("min-h-0 flex-1 overflow-hidden", CONSOLE_GUTTER, "py-4 sm:py-6")}>
      {body}
    </div>
  );
}

/** The console's load failure, inside the page card with the console gutters (M88: never a sign-out). */
export function ConsoleError({ title, onRetry }: { title: string; onRetry: () => void }) {
  const ui = useUiText();
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col justify-center", CONSOLE_GUTTER, "py-6")}>
      <ErrorState title={ui(title)} description={ui("Your work is safe. Check your connection and try again.")} onRetry={onRetry} retryLabel={ui("Try again")} />
    </div>
  );
}

/**
 * A translated sentence whose `{0}`, `{1}` values (names, numbers, amounts) are isolated in `<bdi>` (role-ux R7/R8).
 * The word order comes from the translation, never from fragments glued around a number, so AR and UR read
 * naturally. `text` is an EN UI key with `{n}` placeholders.
 */
export function UiSentence({ text, values }: { text: string; values: ReactNode[] }) {
  const ui = useUiText();
  return (
    <>
      {ui(text).split(/(\{\d+\})/).map((part, index) => {
        const slot = /^\{(\d+)\}$/.exec(part);
        if (slot) return <bdi key={index}>{values[Number(slot[1])]}</bdi>;
        return part ? <Fragment key={index}>{part}</Fragment> : null;
      })}
    </>
  );
}
