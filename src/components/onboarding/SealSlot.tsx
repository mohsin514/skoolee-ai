"use client";

import type { CSSProperties } from "react";
import { EmblemOutline, WaxSeal } from "@/components/auth/WaxSeal";
import { cn } from "@/lib/utils";

/**
 * The empty place the Skoolee wax seal is pressed into when the setup is
 * activated — the screen's one ceremony.
 *
 * - open:    a dashed ring around a blind-stamped emblem (debossed well).
 * - pending: the ring turns solid while activation runs (static).
 * - pressed: the wax seal drops in once (`sk-seal-press`, 120ms delay).
 * - failed:  a warning-dashed ring, no seal.
 *
 * `cover` draws in white on the ink cover; `paper` in brand on white.
 * Decorative: aria-hidden, no text.
 */
export type SealState = "open" | "pending" | "pressed" | "failed";

export type SealSlotProps = {
  state: SealState;
  tone: "cover" | "paper";
  size?: number;          // px, default 56
  className?: string;
};

export function SealSlot({ state, tone, size = 56, className }: SealSlotProps) {
  // --sk-slot-size is the caller's size; a stylesheet may still set --sk-slot (short laptop covers shrink it).
  const style = { ["--sk-slot-size" as string]: `${size / 16}rem`, ["--sk-delay" as string]: "120ms" } as CSSProperties;
  return (
    <span aria-hidden="true" className={cn("sk-seal-slot", className)} data-tone={tone} data-state={state} style={style}>
      {state === "pressed" ? (
        <WaxSeal size={size} finish="wax" state="press" />
      ) : (
        <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
          {/* the debossed well the seal will sit in */}
          <circle cx="50" cy="50" r="46" fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.4} strokeWidth="1.4" />
          <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="1" />
          <g transform="translate(50 50) scale(1.18) translate(-50 -51)"><EmblemOutline strokeWidth={2.6} /></g>
        </svg>
      )}
    </span>
  );
}
