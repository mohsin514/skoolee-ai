"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { EmblemOutline, SealArt } from "./WaxSeal";

/**
 * The sent-state prop: a letter tucked behind a closed envelope, sealed with
 * the Skoolee wax seal at the flap tip.
 *
 * - sealed:   wax seal (pressed once at +200ms unless `press={false}`)
 * - checking: an empty dashed seal slot — the link is being verified
 * - expired:  greyed paper and a broken seal
 * - error:    warning-toned seal
 * Contains no text and no address, so it can sit inside a status region
 * without changing what that status says. Fills come from `.sk-envelope` rules.
 */
export type SealedEnvelopeProps = { variant?: "sealed" | "checking" | "expired" | "error"; size?: "sm" | "md"; press?: boolean; className?: string };

const SIZES = { md: { width: 168, height: 116 }, sm: { width: 128, height: 88 } } as const;

/* Seal centre on the flap tip, in the 168×116 drawing. */
const SEAL = { x: 84, y: 76, size: 42 };

export function SealedEnvelope({ variant = "sealed", size = "md", press, className }: SealedEnvelopeProps) {
  const { width, height } = SIZES[size];
  const pressing = press ?? variant === "sealed";
  const shadowId = `sk-envelope-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-shadow`;
  return (
    <svg
      viewBox="0 0 168 116"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-mascot-anchor="envelope"
      data-variant={variant}
      className={cn("sk-envelope", className)}
    >
      <ellipse data-part="shadow" cx="84" cy="109.5" rx="64" ry="5" />

      {/* the letter, tucked in behind */}
      <g transform="rotate(-6 92 52)">
        <rect data-part="letter" x="40" y="9" width="96" height="66" rx="5" />
        <path data-part="line" d="M53 21.5H105" />
        <path data-part="line" d="M53 30H90" />
      </g>

      {/* back of the envelope: body, side and bottom folds */}
      <rect data-part="body" x="15" y="35" width="138" height="71" rx="9" />
      <path data-part="fold" d="M19 102.5 66.5 76M149 102.5 101.5 76" />

      {/* the closed top flap, its tip under the seal, casting a soft edge on the body */}
      <path data-part="flap-shadow" d="M17.5 41.5 77 79Q84 83.6 91 79L150.5 41.5Z" />
      <path data-part="flap" d="M17.5 39.5Q16.5 35.5 21 35.5H147Q151.5 35.5 150.5 39.5L91 76.5Q84 81.3 77 76.5Z" />
      <path data-part="flap-shade" d="M27 39.5H141" opacity="0.7" />

      {variant === "checking" ? (
        <g>
          {/* an empty, dashed seal slot: the link is still being checked */}
          <circle data-part="seal-slot" cx={SEAL.x} cy={SEAL.y} r={SEAL.size / 2 - 2} />
          <svg x={SEAL.x - SEAL.size / 2} y={SEAL.y - SEAL.size / 2} width={SEAL.size} height={SEAL.size} viewBox="0 0 100 100" overflow="visible" data-part="seal-ghost">
            <EmblemOutline strokeWidth={3.4} />
          </svg>
        </g>
      ) : (
        <svg x={SEAL.x - SEAL.size / 2} y={SEAL.y - SEAL.size / 2} width={SEAL.size} height={SEAL.size} viewBox="0 0 100 100" overflow="visible">
          <defs>
            <filter id={shadowId} x="-30%" y="-30%" width="160%" height="170%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.2" style={{ floodColor: "var(--brand-900)" }} floodOpacity={variant === "expired" ? 0.12 : 0.3} />
            </filter>
          </defs>
          <g className={pressing ? "sk-seal-press" : undefined} filter={`url(#${shadowId})`}>
            <SealArt palette={variant === "expired" ? "muted" : variant === "error" ? "warning" : "wax"} broken={variant === "expired"} detail={false} />
          </g>
        </svg>
      )}
    </svg>
  );
}
