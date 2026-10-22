"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "purple" | "green" | "rose" | "dark";
  onClick?: () => void;
  countUp?: boolean;
  entranceDelay?: number;
  /** Change since the previous period, e.g. { value: "+12%", direction: "up", label: "vs last term" }. */
  trend?: { value: string; direction: "up" | "down" | "flat"; label?: string; positive?: boolean };
}

const toneClass = {
  purple: "bg-brand-50 text-primary",
  green: "bg-status-success-surface text-status-success-text",
  rose: "bg-status-error-surface text-berry",
  dark: "bg-ink-strong text-primary-foreground",
};

const toneGlowClass = {
  purple: "bg-primary/18",
  green: "bg-status-success-border/40",
  rose: "bg-status-error-border/40",
  dark: "bg-primary/14",
};

function useCountUp(target: number, enabled: boolean, duration = 700): string {
  const [display, setDisplay] = useState(String(target));
  const prevValue = useRef(target);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion) {
      setDisplay(String(target));
      prevValue.current = target;
      return;
    }

    const from = prevValue.current;
    prevValue.current = target;
    if (from === target) {
      setDisplay(String(target));
      return;
    }

    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(String(Math.round(from + (target - from) * eased)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration, prefersReducedMotion]);

  return display;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "purple",
  onClick,
  countUp = false,
  entranceDelay = 0,
  trend,
}: StatCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  const isNumeric = typeof value === "number";
  const animatedValue = useCountUp(isNumeric ? value : 0, isNumeric && countUp);
  const displayValue = isNumeric && countUp ? animatedValue : String(value);

  const className = cn(
    "sk-panel relative isolate overflow-hidden p-5 sm:p-6",
    entranceDelay > 0 && "sk-rise",
    onClick && "group w-full cursor-pointer text-start transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-xl active:scale-[0.99] motion-reduce:transform-none"
  );
  const content = (
    <>
      <span aria-hidden="true" className={cn("pointer-events-none absolute -end-10 -top-10 -z-10 size-32 rounded-full opacity-60 blur-2xl", toneGlowClass[tone])} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p dir="auto" className="mb-2 text-xs font-medium text-ink-muted">
            {label}
          </p>
          <p dir="auto" data-numeric className="text-3xl font-bold leading-none tracking-tight text-ink-strong">{displayValue}</p>
          {sub && <p dir="auto" className="mt-2 text-xs text-ink-muted">{sub}</p>}
          {trend && (
            <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span
                data-numeric
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
                  trend.direction === "flat"
                    ? "bg-surface-subtle text-ink-muted"
                    : (trend.positive ?? trend.direction === "up")
                      ? "bg-status-success-surface text-status-success-text"
                      : "bg-status-error-surface text-status-error-text",
                )}
              >
                <span aria-hidden="true">{trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}</span>
                {trend.value}
              </span>
              {trend.label && <span className="text-ink-subtle">{trend.label}</span>}
            </p>
          )}
        </div>
        <div className="relative shrink-0">
          {onClick && <div className={cn("absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500", toneGlowClass[tone])} />}
          <div className={cn("relative flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ring-black/5 shadow-sm", toneClass[tone])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </div>
    </>
  );

  const style = entranceDelay > 0 ? { animationDelay: `${entranceDelay}ms` } : undefined;

  if (onClick) {
    return (
      <Button variant="ghost" type="button" role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown} className={cn("block", className)} style={style}>
        {content}
      </Button>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
