"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared presentation pieces for the student console. Kept in one file so the
 * dashboard, coursework, and attendance pages animate and tone identically
 * instead of each re-deriving its own card styling.
 */

export const BRAND = "#8127cf";

export type Tone = "purple" | "green" | "rose" | "amber";

export const TONES: Record<Tone, { ring: string; text: string; soft: string; solid: string }> = {
  purple: { ring: "#8127cf", text: "text-[#8127cf]", soft: "bg-[#fbf0fe]", solid: "bg-[#8127cf]" },
  green: { ring: "#059669", text: "text-emerald-600", soft: "bg-emerald-50", solid: "bg-emerald-600" },
  rose: { ring: "#e11d48", text: "text-rose-600", soft: "bg-rose-50", solid: "bg-rose-600" },
  amber: { ring: "#d97706", text: "text-amber-600", soft: "bg-amber-50", solid: "bg-amber-600" },
};

/** Respects prefers-reduced-motion: those users get the final value at once. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Counts from 0 to `value` once, on mount. */
export function CountUp({
  value,
  duration = 900,
  prefix = "",
  suffix = "",
  format,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out-cubic: fast start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduced]);

  const rounded = Math.round(display);
  return (
    <>
      {prefix}
      {format ? format(rounded) : rounded.toLocaleString()}
      {suffix}
    </>
  );
}

/** Circular percentage dial used for attendance and fee progress. */
export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
  tone = "purple",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value, reduced]);

  const clamped = Math.max(0, Math.min(shown, 100));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#efe9f3"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TONES[tone].ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: reduced ? undefined : "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-base font-bold leading-none ${TONES[tone].text}`}>
          <CountUp value={Math.round(value)} suffix="%" />
        </span>
        {label && (
          <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wider text-ink-subtle">{label}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The console's one stat card. Optionally carries a dial instead of a flat
 * icon, so "Attendance" and "Fees paid" read as progress rather than numbers.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "purple",
  ring,
  delay = 0,
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
  ring?: number | null;
  delay?: number;
}) {
  const t = TONES[tone];
  return (
    <div
      className="sk-rise group relative overflow-hidden rounded-[18px] border border-[#cfc2d6]/20 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_6px_16px_-10px_rgba(31,26,35,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/30 hover:shadow-[0_2px_4px_rgba(31,26,35,0.05),0_14px_28px_-14px_rgba(129,39,207,0.4)]"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {/* A tinted edge carries the tone without a coloured card. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-60 ${t.solid}`}
      />
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-black leading-none tracking-tight tabular-nums text-[#1d1b20] transition-colors group-hover:text-[#8127cf] sm:text-[22px]">
            {value}
          </p>
          <p className="mt-1.5 truncate text-[10px] font-bold uppercase leading-tight tracking-wider text-ink-muted">
            {label}
          </p>
          {sub && <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-ink-subtle">{sub}</p>}
        </div>
        {typeof ring === "number" ? (
          <ProgressRing value={ring} tone={tone} size={46} stroke={5} />
        ) : (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${t.soft} ${t.text}`}
          >
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Section heading with a tinted icon chip — used above every panel. */
export function PanelHeading({
  icon: Icon,
  title,
  sub,
  tone = "purple",
  action,
}: {
  icon: any;
  title: string;
  sub?: string;
  tone?: Tone;
  action?: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${t.soft} ${t.text}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black tracking-tight text-[#1d1b20]">{title}</h3>
          {sub && (
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">{sub}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Standard white panel the student pages sit their content in. */
export function Panel({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`sk-rise rounded-[22px] border border-[#cfc2d6]/20 bg-white p-4 shadow-[0_1px_2px_rgba(31,26,35,0.04),0_10px_28px_-16px_rgba(31,26,35,0.35)] ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The console's one empty state.
 *
 * Coursework, Reports, Fees, Timetable and Attendance each hand-rolled this —
 * five copies that had drifted to three different paddings, two radii and
 * headings ranging from `text-sm` to `text-xl`. The guardian portal already
 * had a single `ParentEmptyState`; this is its counterpart.
 */
export function StudentEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: any;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-[#cfc2d6]/25 bg-[#fbf0fe]/15 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fbf0fe]">
        <Icon className="h-6 w-6 text-[#8127cf]/40" />
      </div>
      <h3 className="text-sm font-black tracking-tight text-[#1d1b20]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs font-semibold leading-relaxed text-ink-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
