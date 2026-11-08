"use client";

/**
 * A failed load or a broken route. States what happened in plain words,
 * offers the one useful next step (try again), and keeps the technical
 * reference available for support without putting a stack trace in front of
 * a parent or a teacher.
 */

import * as React from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Button } from "./button";
import { RequestFailure } from "@/lib/http/request-state";
import { AccessNotice } from "./access-notice";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** The caught error; only its digest (server reference) is ever shown. */
  error?: (Error & { digest?: string }) | null;
  /**
   * Retry the failed load. A returned promise keeps the button busy until it settles; any other return value is
   * ignored (so `() => refetch()` and `() => toast(...)` callers keep compiling).
   */
  onRetry?: () => unknown;
  retryLabel?: string;
  /** Extra actions, e.g. a link back to the dashboard. */
  action?: React.ReactNode;
  /** `page` centres in a full card; `panel` sits inside an existing surface. */
  variant?: "page" | "panel";
  /** Show the offline wording and icon. */
  offline?: boolean;
  className?: string;
}

export function ErrorState({ title, description, error, onRetry, retryLabel, action, variant = "panel", offline = false, className }: ErrorStateProps) {
  const tr = useUiText();
  const [retrying, setRetrying] = React.useState(false);
  const mounted = React.useRef(true);
  const inFlight = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const retry = React.useCallback(async () => {
    if (!onRetry || inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try { await onRetry(); } catch { /* The owning loader retains its failure state. */ }
    finally { inFlight.current = false; if (mounted.current) setRetrying(false); }
  }, [onRetry]);
  const kind = error instanceof RequestFailure ? error.kind : offline ? "offline" : null;
  const copy: Record<string, [string, string]> = {
    timeout: ["The request timed out", "Your work is kept. Try again when the service responds."],
    conflict: ["This record has changed", "Your draft is kept. Review the latest record before saving again."],
    validation: ["Check the information", "Your work is kept. Correct the highlighted fields and try again."],
    limited: ["Too many requests", "Your work is kept. Wait a moment before trying again."],
    provider: ["A service is unavailable", "Your work is kept. Try again in a moment."],
    server: ["Something went wrong", "We couldn't load this right now. Please try again."],
    offline: ["You're offline", "Check your connection and try again."],
  };
  if (kind === "denied" || kind === "session") return <AccessNotice
    title={kind === "session" ? "Sign in again" : "Not available with your access"}
    reason={kind === "session" ? "Your session has ended. Sign in again to continue." : "Ask your school administrator for access or choose an available workspace."}
    action={action ?? <Button type="button" variant="outline" onClick={() => window.location.assign("/login")}>{tr(kind === "session" ? "Sign in again" : "Back to dashboard")}</Button>}
  />;
  const classified = kind ? copy[kind] : null;
  const Icon = kind === "offline" ? WifiOff : AlertTriangle;
  const reference = error?.digest;
  const page = variant === "page";
  return (
    <section
      role="alert"
      data-resource-state="failure"
      data-failure-kind={kind ?? "server"}
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden text-center",
        page ? "sk-panel w-full max-w-md px-6 py-10 sm:px-10" : "px-6 py-12",
        className,
      )}
    >
      {page ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,var(--status-error-surface),transparent)]" /> : null}
      <div aria-hidden="true" className={cn("mb-5 grid place-items-center rounded-[22px] border border-status-error-border bg-status-error-surface text-status-error-text shadow-sm", page ? "size-16" : "size-14")}>
        <Icon className={page ? "size-7" : "size-6"} strokeWidth={2} />
      </div>
      <h2 className={cn("font-bold text-ink-strong", page ? "text-xl" : "text-lg")}>
        {(classified ? tr(classified[0]) : title) ?? (offline ? tr("You're offline") : tr("Something went wrong"))}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        {(classified ? tr(classified[1]) : description) ?? (offline ? tr("Check your connection and try again.") : tr("We couldn't load this right now. Please try again."))}
      </p>
      {onRetry || action ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button type="button" onClick={retry} loading={retrying}>
              {retrying ? null : <RefreshCw aria-hidden="true" />}
              {retrying ? tr("Retrying…") : retryLabel ?? tr("Try again")}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
      {reference ? (
        <p className="mt-5 text-xs text-ink-subtle">
          {tr("Error reference")}: <code dir="ltr" className="rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-muted">{reference}</code>
        </p>
      ) : null}
    </section>
  );
}
