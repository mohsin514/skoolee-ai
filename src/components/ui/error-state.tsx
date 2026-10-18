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
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** The caught error; only its digest (server reference) is ever shown. */
  error?: (Error & { digest?: string }) | null;
  onRetry?: () => void;
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
  const Icon = offline ? WifiOff : AlertTriangle;
  const reference = error?.digest;
  const page = variant === "page";
  return (
    <section
      role="alert"
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden text-center",
        page ? "sk-panel w-full max-w-md px-6 py-10 sm:px-10" : "px-6 py-12",
        className,
      )}
    >
      {page ? <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(239_68_68/0.10),transparent)]" /> : null}
      <div aria-hidden="true" className={cn("mb-5 grid place-items-center rounded-[22px] border border-status-error-border bg-status-error-surface text-red-700 shadow-sm", page ? "size-16" : "size-14")}>
        <Icon className={page ? "size-7" : "size-6"} strokeWidth={2} />
      </div>
      <h2 className={cn("font-bold text-ink-strong", page ? "text-xl" : "text-lg")}>
        {title ?? (offline ? tr("You're offline") : tr("Something went wrong"))}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        {description ?? (offline ? tr("Check your connection and try again.") : tr("We couldn't load this right now. Please try again."))}
      </p>
      {onRetry || action ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button type="button" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              {retryLabel ?? tr("Try again")}
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
