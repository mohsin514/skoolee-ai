"use client";

/**
 * The banner each leadership console opens with.
 *
 * Exactly one hero figure per view — the number the role is actually judged on
 * — with the supporting ratios beside it as meters rather than as more big
 * numbers competing for the same attention.
 *
 * It sits under the view's PageHeader (the one h1, §4.3), so its title is an h2 by default. Callers pass
 * translated text (they own the copy); numbers use the school's numbering system and labels never take
 * case changes or letter spacing in Arabic or Urdu (R8).
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroFigure, Meter } from "./chart-kit";
import { Button } from "@/components/ui/button";
import { useLocaleFormat } from "@/components/locale/LocaleProvider";


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
  headingLevel = 2,
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
  /** 2 under a PageHeader (default); 1 only on a screen without one. */
  headingLevel?: 1 | 2;
}) {
  const { number } = useLocaleFormat();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="sk-rise relative overflow-hidden rounded-[32px] bg-gradient-to-br from-ink-strong via-brand-950 to-ink-strong p-6 text-white shadow-[0_14px_36px_-10px_rgba(120,70,180,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:p-8">
      {/* Decorative only — pointer-events-none so nothing here eats a click. */}
      <div aria-hidden className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-gradient-to-bl from-primary/30 to-transparent blur-[70px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-16 -start-12 h-48 w-48 rounded-full bg-gradient-to-tr from-brand-300/20 to-transparent blur-[60px]" />
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
              <p className="text-2xs font-semibold uppercase tracking-wider text-brand-200 rtl:normal-case rtl:tracking-normal"><bdi>{eyebrow}</bdi></p>
              {/* Wraps on a phone rather than truncating — the title is short enough
                  to fit two lines and losing its last word reads as a bug. */}
              <Heading className="mt-1.5 text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{title}</Heading>
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
                    color={meter.color ?? "var(--brand-300)"}
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
                    ? "ring-1 ring-status-error-border/40 bg-status-error-text/10"
                    : pill.tone === "warning"
                      ? "ring-1 ring-status-warning-border/40 bg-status-warning-text/10"
                      : "bg-white/8 ring-1 ring-white/10";
                const content = (
                  <>
                    <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-200" />
                    <span className="text-2xs font-semibold uppercase tracking-wider text-white/60 rtl:normal-case rtl:tracking-normal">{pill.label}</span>
                    <bdi className="text-xs font-bold text-white [font-variant-numeric:tabular-nums]">
                      {typeof pill.value === "number" ? number(pill.value, 0) : pill.value}
                    </bdi>
                  </>
                );
                return (
                  <li key={pill.label}>
                    {pill.onClick ? (
                      <Button variant="outline"
                        type="button"
                        onClick={pill.onClick}
                        className={cn(
                          "flex justify-start items-center gap-2 backdrop-blur",
                          toneRing,
                        )}
                      >
                        {content}
                      </Button>
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
          <div className="flex justify-center rounded-[28px] bg-card/95 p-5 shadow-[0_18px_40px_-16px_rgba(120,70,180,0.5)] lg:justify-end">
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
