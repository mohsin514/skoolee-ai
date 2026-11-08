"use client";

import { cn } from "@/lib/utils";

/**
 * A quiet countdown dial for "Try again in 12s" / "Auto-redirecting in 4s".
 * Exactly one <svg>, aria-hidden (the words carry the number), and
 * transition-only: it never has an `animation`, so animation-name is `none`
 * in every motion mode.
 */
export type CountdownRingProps = { total: number; remaining: number; size?: number /* 16 */; tone?: "brand" | "onBrand" | "success"; className?: string };

const TONES: Record<NonNullable<CountdownRingProps["tone"]>, string> = {
  brand: "text-primary",
  onBrand: "text-white",
  success: "text-status-success-text",
};

export function CountdownRing({ total, remaining, size = 16, tone = "brand", className }: CountdownRingProps) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn("sk-countdown-ring", TONES[tone], className)}
    >
      <circle data-part="track" cx="10" cy="10" r="8" strokeWidth="2.5" />
      <circle data-part="value" cx="10" cy="10" r="8" strokeWidth="2.5" pathLength={1} style={{ strokeDashoffset: 1 - fraction }} />
    </svg>
  );
}
