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
          <span className="mt-0.5 text-[7px] font-bold uppercase tracking-wider text-[#4d4354]/40">{label}</span>
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
      className="sk-rise group relative overflow-hidden rounded-[28px] bg-white border border-[#cfc2d6]/25 p-5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all duration-300 hover:-translate-y-1 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)]"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#4d4354]/40 transition-colors group-hover:text-[#4d4354]/60">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold leading-none text-[#1d1b20] transition-colors group-hover:text-[#8127cf]">
            {value}
          </p>
          {sub && <p className="mt-1.5 truncate text-[10px] font-semibold text-[#4d4354]/40">{sub}</p>}
        </div>
        {typeof ring === "number" ? (
          <ProgressRing value={ring} tone={tone} size={64} stroke={6} />
        ) : (
          <div className="relative shrink-0">
            <div
              className={`absolute -inset-2 rounded-xl blur-lg opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${t.soft}`}
            />
            <div
              className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${t.soft} ${t.text} group-hover:${t.solid} group-hover:text-white`}
            >
              <Icon className="h-5 w-5" />
            </div>
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
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${t.soft} ${t.text}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-[#1d1b20]">{title}</h3>
          {sub && (
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#4d4354]/40">{sub}</p>
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
      className={`sk-rise rounded-[28px] border border-[#cfc2d6]/25 bg-white p-6 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
