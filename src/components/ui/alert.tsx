"use client";

/**
 * Inline notice for a page, panel, form or dialog: something the reader
 * should know before acting (info), a completed outcome (success), a risk
 * (warning), a failure or block (danger), a Skoolee recommendation (brand) or
 * a plain aside (neutral). Screens drew these as one-off coloured boxes with
 * different radii, weights and icon sizes; this is the shared one.
 *
 * Tone is never the only signal: every alert carries a title or text.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Sparkles, X, XCircle, type LucideIcon } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "danger" | "brand" | "neutral";

const TONES: Record<AlertTone, { surface: string; chip: string; title: string; icon: LucideIcon }> = {
  info: { surface: "border-status-info-border bg-status-info-surface", chip: "bg-white/80 text-blue-700 ring-1 ring-status-info-border", title: "text-status-info-text", icon: Info },
  success: { surface: "border-status-success-border bg-status-success-surface", chip: "bg-white/80 text-emerald-700 ring-1 ring-status-success-border", title: "text-status-success-text", icon: CheckCircle2 },
  warning: { surface: "border-status-warning-border bg-status-warning-surface", chip: "bg-white/80 text-amber-700 ring-1 ring-status-warning-border", title: "text-status-warning-text", icon: AlertTriangle },
  danger: { surface: "border-status-error-border bg-status-error-surface", chip: "bg-white/80 text-red-700 ring-1 ring-status-error-border", title: "text-status-error-text", icon: XCircle },
  brand: { surface: "border-status-brand-border bg-status-brand-surface", chip: "bg-white/80 text-primary ring-1 ring-status-brand-border", title: "text-status-brand-text", icon: Sparkles },
  neutral: { surface: "border-border-subtle bg-surface-subtle", chip: "bg-white text-ink-muted ring-1 ring-border-subtle", title: "text-ink-strong", icon: Info },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: React.ReactNode;
  /** Replace the tone's icon, or pass `false` for none. */
  icon?: LucideIcon | false;
  /** Buttons or links shown under the text (or beside it when compact). */
  actions?: React.ReactNode;
  /** Shows a dismiss control; the caller owns visibility. */
  onDismiss?: () => void;
  /** Single-line density for toolbars and table headers. */
  compact?: boolean;
  /**
   * Live-region politeness. Defaults to "assertive" for danger and "polite"
   * otherwise; pass "off" for a notice that is part of the page on load.
   */
  live?: "polite" | "assertive" | "off";
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, icon, actions, onDismiss, compact = false, live, className, children, ...props },
  ref,
) {
  const tr = useUiText();
  const style = TONES[tone];
  const Icon = icon === false ? null : icon ?? style.icon;
  const politeness = live ?? (tone === "danger" ? "assertive" : "polite");
  const role = politeness === "off" ? undefined : politeness === "assertive" ? "alert" : "status";

  return (
    <div
      ref={ref}
      role={role}
      data-tone={tone}
      className={cn(
        "relative flex w-full min-w-0 gap-3 rounded-2xl border text-sm text-ink shadow-xs",
        compact ? "items-center px-3 py-2.5" : "items-start p-4",
        style.surface,
        className,
      )}
      {...props}
    >
      {Icon ? (
        <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-xl", compact ? "size-7" : "size-8", style.chip)}>
          <Icon className={compact ? "size-4" : "size-[18px]"} strokeWidth={2.25} />
        </span>
      ) : null}
      <div className={cn("min-w-0 flex-1", compact ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "pt-0.5")}>
        {title ? <p className={cn("font-semibold leading-snug", style.title)}>{title}</p> : null}
        {children ? <div className={cn("leading-relaxed text-ink", title && !compact && "mt-1")}>{children}</div> : null}
        {actions ? <div className={cn("flex flex-wrap items-center gap-2", compact ? "ms-auto" : "mt-3")}>{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={tr("Dismiss")}
          className="-me-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink-strong"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
});
