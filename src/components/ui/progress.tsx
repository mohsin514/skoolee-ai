import * as React from "react";
import { cn } from "@/lib/utils";

export type ProgressTone = "brand" | "success" | "warning" | "danger" | "neutral";

const bars: Record<ProgressTone, string> = {
  brand: "bg-gradient-to-r from-brand-500 to-brand-700",
  success: "bg-gradient-to-r from-emerald-500 to-emerald-600",
  warning: "bg-gradient-to-r from-amber-400 to-amber-500",
  danger: "bg-gradient-to-r from-rose-500 to-red-600",
  neutral: "bg-ink-faint",
};

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  value: number;
  max?: number;
  /** Accessible name. Required unless aria-labelledby is given. */
  label?: string;
  tone?: ProgressTone;
  size?: "sm" | "md";
  /** Shows the label and percentage above the bar. */
  showValue?: boolean;
  /** Overrides the formatted percentage (e.g. "12 of 30"). */
  valueText?: string;
}

/** A determinate progress bar with its value exposed to assistive tech. */
export function Progress({ value, max = 100, label, tone = "brand", size = "md", showValue = false, valueText, className, ...props }: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 100);
  const text = valueText ?? `${percent}%`;
  return (
    <div className={cn("w-full min-w-0", className)}>
      {showValue && (label || text) ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          {label ? <span className="truncate font-medium text-ink-muted">{label}</span> : <span />}
          <span data-numeric className="font-semibold text-ink-strong">{text}</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={props["aria-labelledby"] ? undefined : label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={text}
        className={cn("relative overflow-hidden rounded-full bg-brand-100/80 shadow-[inset_0_1px_2px_rgb(55_27_77/0.08)]", size === "sm" ? "h-1.5" : "h-2.5")}
        {...props}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", bars[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
