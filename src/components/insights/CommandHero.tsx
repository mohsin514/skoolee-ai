"use client";

/**
 * The banner each leadership console opens with.
 *
 * Exactly one hero figure per view — the number the role is actually judged on
 * — with the supporting ratios beside it as meters rather than as more big
 * numbers competing for the same attention.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroFigure, Meter } from "./chart-kit";

export interface HeroMeter {
  label: string;
  value: number;
  max: number;
  valueLabel?: string;
  color?: string;
}

export interface HeroPill {
  icon: LucideIcon;
  label: string;
  value: string | number;
  onClick?: () => void;
  tone?: "default" | "warning" | "critical";
}

export function CommandHero({
  eyebrow,
  title,
  heroValue,
  heroLabel,
  heroCaption,
  heroAccent,
  meters = [],
  pills = [],
  aside,
  actions,
}: {
  eyebrow: string;
  title: string;
  heroValue: string;
  heroLabel: string;
  heroCaption?: string;
  heroAccent?: ReactNode;
  meters?: HeroMeter[];
  pills?: HeroPill[];
  aside?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="sk-rise relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#1f1a23] via-[#2a2130] to-[#2d2533] p-6 text-white shadow-[0_14px_36px_-10px_rgba(31,26,35,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:p-8">
      {/* Decorative only — pointer-events-none so nothing here eats a click. */}
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-bl from-[#8127cf]/30 to-transparent blur-[70px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-gradient-to-tr from-[#b876f0]/20 to-transparent blur-[60px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at 20% 0%, #000 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 20% 0%, #000 0%, transparent 70%)",
        }}
      />

      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d9b8f5]">{eyebrow}</p>
              {/* Wraps on a phone rather than truncating — the title is short enough
                  to fit two lines and losing its last word reads as a bug. */}
              <h1 className="mt-1.5 text-2xl font-black tracking-tight text-balance sm:text-3xl">{title}</h1>
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>

          <div className="mt-7 grid gap-7 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <HeroFigure value={heroValue} label={heroLabel} caption={heroCaption} accent={heroAccent} />
            {meters.length > 0 ? (
              <div className="grid gap-4 sm:max-w-sm">
                {meters.map((meter) => (
                  <Meter
                    key={meter.label}
                    label={meter.label}
                    value={meter.value}
                    max={meter.max}
                    valueLabel={meter.valueLabel}
                    color={meter.color ?? "#c795f0"}
                    onDark
                  />
                ))}
              </div>
            ) : null}
          </div>

          {pills.length > 0 ? (
            <ul className="mt-7 flex flex-wrap gap-2">
              {pills.map((pill) => {
                const Icon = pill.icon;
                const toneRing =
                  pill.tone === "critical"
                    ? "ring-1 ring-rose-400/40 bg-rose-500/10"
                    : pill.tone === "warning"
                      ? "ring-1 ring-amber-300/40 bg-amber-400/10"
                      : "bg-white/8 ring-1 ring-white/10";
                const content = (
                  <>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[#d9b8f5]" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-white/60">{pill.label}</span>
                    <span className="text-xs font-black text-white [font-variant-numeric:tabular-nums]">
                      {typeof pill.value === "number" ? pill.value.toLocaleString() : pill.value}
                    </span>
                  </>
                );
                return (
                  <li key={pill.label}>
                    {pill.onClick ? (
                      <button
                        type="button"
                        onClick={pill.onClick}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-2xl px-3.5 py-2 backdrop-blur transition-all hover:bg-white/15 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#8127cf]/30",
                          toneRing,
                        )}
                      >
                        {content}
                      </button>
                    ) : (
                      <span className={cn("flex items-center gap-2 rounded-2xl px-3.5 py-2 backdrop-blur", toneRing)}>
                        {content}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {aside ? (
          <div className="flex justify-center rounded-[28px] bg-white/95 p-5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)] lg:justify-end">
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
