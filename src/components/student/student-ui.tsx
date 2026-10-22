"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared presentation pieces for the student console. Kept in one file so the
 * dashboard, coursework, and attendance pages animate and tone identically
 * instead of each re-deriving its own card styling.
 */

export const BRAND = "var(--color-primary)";

export type Tone = "purple" | "green" | "rose" | "amber";

export const TONES: Record<Tone, { ring: string; text: string; soft: string; solid: string }> = {
  purple: { ring: "var(--color-primary)", text: "text-primary", soft: "bg-brand-50", solid: "bg-primary" },
  green: { ring: "var(--color-success)", text: "text-status-success-text", soft: "bg-status-success-surface", solid: "bg-success" },
  rose: { ring: "var(--color-destructive)", text: "text-status-error-text", soft: "bg-status-error-surface", solid: "bg-destructive" },
  amber: { ring: "var(--color-warning)", text: "text-status-warning-text", soft: "bg-status-warning-surface", solid: "bg-warning" },
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
          stroke="var(--color-edge)"
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
          <span className="mt-0.5 text-3xs font-semibold text-ink-subtle">{label}</span>
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
      className="sk-rise sk-panel relative overflow-hidden px-[12px] py-[10px] sm:px-3.5 sm:py-2.5"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {/* A tinted edge carries the tone without a coloured card. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 start-0 w-[3px] opacity-40 ${t.solid}`}
      />
      <div className="relative flex min-w-0 items-center justify-between gap-[10px]">
        <div className="min-w-0 flex-1">
          <p dir="auto" className="[overflow-wrap:anywhere] text-xl font-bold leading-none tracking-tight tabular-nums text-ink-strong sm:text-[22px]">
            {value}
          </p>
          <p dir="auto" className="mt-1.5 [overflow-wrap:anywhere] text-xs font-semibold leading-tight text-ink-muted">
            {label}
          </p>
          {sub && <p dir="auto" className="mt-0.5 [overflow-wrap:anywhere] text-xs font-medium leading-tight text-ink-muted">{sub}</p>}
        </div>
        {typeof ring === "number" ? (
          <ProgressRing value={ring} tone={tone} size={46} stroke={5} />
        ) : (
          <div
            className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-xl ${t.soft}  ${t.text}`}
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
    <div className="mb-[12px] flex flex-wrap items-center justify-between gap-[10px]">
      <div className="flex min-w-[min(100%,12rem)] flex-1 items-center gap-[10px]">
        <div className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-xl ${t.soft}  ${t.text}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-ink-strong [overflow-wrap:anywhere]">{title}</h3>
          {sub && (
            <p className="truncate text-2xs font-semibold text-ink-subtle">{sub}</p>
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
      className={`sk-rise sk-panel min-w-0 p-[12px] sm:p-4 ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

