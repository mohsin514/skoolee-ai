"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONFLICT_FIXES, CONFLICT_LABELS, type BulkConflict } from "@/lib/academic/exam-conflicts";

/**
 * Pieces the five exam steps share, so the workspace looks like one screen
 * rather than five that happen to sit behind the same tab strip.
 */

export const EXAM_ACCENT = "#8127cf";

/** A soft progress meter. Reads as "x of y", not as a bare percentage. */
export function Meter({
  value,
  total,
  tone = "violet",
  className,
}: {
  value: number;
  total: number;
  tone?: "violet" | "emerald" | "amber" | "rose";
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const bar =
    tone === "emerald"
      ? "from-emerald-400 to-emerald-600"
      : tone === "amber"
      ? "from-amber-400 to-amber-600"
      : tone === "rose"
      ? "from-rose-400 to-rose-600"
      : "from-[#8127cf] to-[#b06bea]";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#e8e0ec]/60", className)}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A labelled number with a meter underneath — the workspace's unit of status. */
export function ProgressStat({
  icon: Icon,
  label,
  value,
  total,
  suffix,
  tone = "violet",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total: number;
  suffix?: string;
  tone?: "violet" | "emerald" | "amber" | "rose";
}) {
  const chip =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "amber"
      ? "bg-amber-50 text-amber-600"
      : tone === "rose"
      ? "bg-rose-50 text-rose-600"
      : "bg-[#f3eeff] text-[#8127cf]";
  return (
    <div className="rounded-[18px] border border-[#cfc2d6]/20 bg-white p-3.5 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_8px_20px_-14px_rgba(31,26,35,0.28)]">
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", chip)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black leading-none tabular-nums text-[#1f1a23]">
            {value}
            {total > 0 ? <span className="text-xs font-bold text-ink-subtle"> / {total}</span> : null}
            {suffix ? <span className="text-xs font-bold text-ink-subtle"> {suffix}</span> : null}
          </p>
          <p className="mt-1 truncate text-[10px] font-black uppercase tracking-wider text-ink-muted">
            {label}
          </p>
        </div>
      </div>
      {total > 0 ? <Meter value={value} total={total} tone={tone} className="mt-2.5" /> : null}
    </div>
  );
}

/**
 * The conflict list.
 *
 * Grouped by kind rather than listed flat, because ten "falls on a weekend"
 * rows are one decision, not ten. Every group carries the fix, so the panel is
 * a worklist instead of a complaint.
 */
export function ConflictPanel({
  conflicts,
  onDismiss,
  compact = false,
}: {
  conflicts: BulkConflict[];
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const groups = React.useMemo(() => {
    const map = new Map<string, BulkConflict[]>();
    conflicts.forEach((c) => map.set(c.kind, [...(map.get(c.kind) ?? []), c]));
    return [...map.entries()].sort((a, b) => {
      const aBlocks = a[1].some((c) => c.blocking) ? 0 : 1;
      const bBlocks = b[1].some((c) => c.blocking) ? 0 : 1;
      return aBlocks - bBlocks;
    });
  }, [conflicts]);

  if (conflicts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <p className="text-xs font-bold text-emerald-700">
          No conflicts. Every paper sits on a working day with nothing clashing.
        </p>
      </div>
    );
  }

  const blocking = conflicts.filter((c) => c.blocking).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#cfc2d6]/25 bg-white shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_26px_-16px_rgba(31,26,35,0.3)]">
      <div
        className={cn(
          "flex items-center gap-2.5 px-4 py-2.5",
          blocking > 0 ? "bg-rose-50/70" : "bg-amber-50/70",
        )}
      >
        <AlertTriangle
          className={cn("h-4 w-4 shrink-0", blocking > 0 ? "text-rose-600" : "text-amber-600")}
        />
        <p className={cn("text-xs font-black", blocking > 0 ? "text-rose-700" : "text-amber-700")}>
          {blocking > 0
            ? `${blocking} conflict${blocking === 1 ? "" : "s"} must be fixed`
            : `${conflicts.length} thing${conflicts.length === 1 ? "" : "s"} worth checking`}
        </p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto cursor-pointer text-[10px] font-black uppercase tracking-wider text-ink-subtle hover:text-[#8127cf]"
          >
            Hide
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-[#cfc2d6]/12">
        {groups.map(([kind, items]) => (
          <div key={kind} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  items.some((i) => i.blocking) ? "bg-rose-500" : "bg-amber-500",
                )}
              />
              <p className="text-[11px] font-black text-[#1f1a23]">
                {CONFLICT_LABELS[kind as keyof typeof CONFLICT_LABELS] ?? kind}
              </p>
              <span className="rounded-full bg-[#f3eeff] px-1.5 py-0.5 text-[9px] font-black tabular-nums text-[#8127cf]">
                {items.length}
              </span>
            </div>
            {!compact ? (
              <ul className="mt-1.5 space-y-0.5 pl-3.5">
                {items.slice(0, 6).map((c, i) => (
                  <li key={i} className="text-[11px] font-semibold leading-snug text-ink-muted">
                    {c.message}
                  </li>
                ))}
                {items.length > 6 ? (
                  <li className="text-[11px] font-bold text-ink-subtle">
                    …and {items.length - 6} more
                  </li>
                ) : null}
              </ul>
            ) : null}
            <p className="mt-1.5 flex items-start gap-1.5 pl-3.5 text-[10px] font-semibold leading-snug text-[#8127cf]">
              <Info className="mt-px h-3 w-3 shrink-0" />
              {CONFLICT_FIXES[kind as keyof typeof CONFLICT_FIXES] ?? "Review this paper."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A dashed placeholder that says what to do next, not just that it is empty. */
export function StepEmpty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[#cfc2d6]/35 bg-gradient-to-b from-white to-[#faf7fc] px-8 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3eeff]">
        <Icon className="h-6 w-6 text-[#8127cf]" />
      </span>
      <h4 className="text-base font-black tracking-tight text-[#1f1a23]">{title}</h4>
      <p className="mt-1.5 max-w-md text-xs font-semibold leading-relaxed text-ink-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Panel shell — one rounded card, used by every step so they line up. */
export function Panel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[24px] border border-[#cfc2d6]/25 bg-white shadow-[0_2px_6px_rgba(31,26,35,0.05),0_16px_40px_-24px_rgba(129,39,207,0.28)]",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-[#cfc2d6]/15 bg-gradient-to-r from-[#faf7fc] to-white px-5 py-3.5">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff]">
            <Icon className="h-4.5 w-4.5 text-[#8127cf]" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black tracking-tight text-[#1f1a23]">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-semibold text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Consistent labelled control. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block pl-0.5 text-[10px] font-black uppercase tracking-wider text-ink-subtle">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block pl-0.5 text-[10px] font-semibold leading-snug text-ink-subtle">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-xl border border-[#cfc2d6]/25 bg-white px-3 text-sm font-bold text-[#1f1a23] outline-none transition-colors focus:border-[#8127cf]/50 focus:ring-4 focus:ring-[#8127cf]/12";

export const selectClass = cn(inputClass, "cursor-pointer");
