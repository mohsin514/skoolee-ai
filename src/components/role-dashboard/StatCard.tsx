"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (!enabled) {
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
  }, [target, enabled, duration]);

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
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
    "group bg-white p-6 rounded-[28px] border border-[#cfc2d6]/25 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)] transition-all",
    entranceDelay > 0 && "sk-rise",
    onClick && "w-full cursor-pointer text-left hover:-translate-y-0.5 hover:border-[#8127cf]/25 hover:shadow-[0_10px_28px_-6px_rgba(31,26,35,0.14),0_22px_50px_-16px_rgba(129,39,207,0.32)] focus:outline-none focus:ring-4 focus:ring-[#8127cf]/10"
  );
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-[#4d4354]/40 uppercase tracking-wider mb-2">
            {label}
          </p>
          <p className="text-3xl font-black text-[#1f1a23] leading-none">{displayValue}</p>
          {sub && <p className="text-[10px] font-bold text-[#4d4354]/40 uppercase tracking-wider mt-2">{sub}</p>}
        </div>
        <div className="relative shrink-0">
          <div className={cn("absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500", toneGlowClass[tone])} />
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
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown} className={className} style={style}>
        {content}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
