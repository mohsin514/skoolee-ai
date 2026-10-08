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
}

const toneClass = {
  purple: "bg-[#fbf0fe] text-[#8127cf]",
  green: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-[#b10e6b]",
  dark: "bg-[#1f1a23] text-white",
};

const toneGlowClass = {
  purple: "bg-[#8127cf]/18",
  green: "bg-emerald-500/18",
  rose: "bg-rose-500/18",
  dark: "bg-[#1f1a23]/18",
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
    "sk-panel p-6",
    entranceDelay > 0 && "sk-rise",
    onClick && "group w-full cursor-pointer text-start transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] active:scale-[0.99] motion-reduce:transform-none"
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p dir="auto" className="mb-2 text-xs font-semibold text-ink-muted">
            {label}
          </p>
          <p dir="auto" className="text-3xl font-black leading-none text-foreground">{displayValue}</p>
          {sub && <p dir="auto" className="mt-2 text-xs font-semibold text-ink-muted">{sub}</p>}
        </div>
        <div className="relative shrink-0">
          {onClick && <div className={cn("absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500", toneGlowClass[tone])} />}
          <div className={cn("relative h-11 w-11 rounded-2xl flex items-center justify-center", toneClass[tone])}>
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
