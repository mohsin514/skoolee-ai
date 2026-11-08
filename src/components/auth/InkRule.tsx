"use client";

import { useId } from "react";

/**
 * The brand-ink swash under the wordmark: a hand-pulled stroke that doubles
 * as the splash progress bar. No CSS animation; the caller drives `progress`.
 * Mirrored in RTL so the stroke "writes" from the inline start.
 */
export type InkRuleProps = { progress?: number /* 0..1, default 1 */; width?: string /* default "3rem" */; className?: string };

/** At small fixed widths the 3.2-unit stroke would render as a hairline; keep it near 2.4px. */
function strokeFor(width: string): number {
  const match = /^(\d+(?:\.\d+)?)(rem|px)$/.exec(width.trim());
  if (!match) return 3.2;
  const px = Number(match[1]) * (match[2] === "rem" ? 16 : 1);
  return Math.min(7, Math.max(3.2, (2.4 * 120) / Math.max(px, 1)));
}

export function InkRule({ progress = 1, width = "3rem", className }: InkRuleProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradient = `sk-ink-rule-${uid}`;
  const amount = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;
  const stroke = strokeFor(width);
  return (
    <svg
      viewBox="0 0 120 14"
      className={className ? `sk-ink-mirror ${className}` : "sk-ink-mirror"}
      style={{ width, height: "auto", overflow: "visible" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--brand-600)" }} />
          <stop offset="100%" style={{ stopColor: "var(--brand-400)" }} />
        </linearGradient>
      </defs>
      <path
        d="M3 9 C30 3,52 13,78 7 S112 5,117 6"
        fill="none"
        stroke={`url(#${gradient})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength={1}
        // Dash 1, gap 2: the next dash can never start at the path's end, which
        // drew a stray round-cap dot there at progress 0 (the splash's first frame).
        strokeDasharray="1 2"
        strokeDashoffset={1 - amount}
        visibility={amount > 0 ? undefined : "hidden"}
      />
    </svg>
  );
}
