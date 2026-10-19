"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import SkooleeLogo from "@/components/SkooleeLogo";
import { resolveMood } from "@/lib/auth/mascot-mood";
import { cn } from "@/lib/utils";
import { InkRule } from "./InkRule";
import { useMascotWatch } from "./use-mascot-watch";

/**
 * The single live face on every auth screen: the real Skoolee wordmark in
 * expressive mode. It looks at what you type, closes its eyes on passwords,
 * peeks when you reveal one, widens at Caps Lock, glances at errors, smiles
 * on success and tosses its cap when your email is verified.
 *
 * Exactly one role="img" ("Skoolee AI"); no roles, live regions or
 * focusables of its own — every state it shows is already stated in text.
 * The server (and hydration) render data-mood="idle"; everything else
 * happens after mount. Reduced motion: static poses only.
 */
export type AuthMascotSignals = {
  error?: string | number | null;   // a change to a truthy value plays the concerned glance, then decays after 2400ms
  success?: boolean;                 // happy pose; turning true plays one cap hop
  waiting?: boolean;                 // half lids, gaze at [data-mascot-anchor="cooldown"] if present
  thinking?: boolean;                // static up-start gaze
  celebrate?: boolean;               // turning true plays one cap toss
  glance?: string | null;            // CSS selector inside <main>; each change glances there for 900ms
};

export type AuthMascotProps = {
  size?: string;                     // default "min(2.6rem, 11vw)"; the vw cap protects 360px at 200% root
  weight?: "heavy" | "regular";      // default "heavy"
  rule?: boolean;                    // default true: renders <InkRule/> under the mark
  entrance?: "none" | "wake";        // default "none"
  /** Shut eyes and no cap (motion allowed only), from the server frame on: the splash's pre-wake pose. */
  asleep?: boolean;
  /** Seconds per idle pupil look-around; omitted keeps the wordmark's own 4s (the splash uses 2s). */
  lookDuration?: number;
  signals?: AuthMascotSignals;
  className?: string;
};

const noopSubscribe = () => () => {};

export function AuthMascot({ size = "min(2.6rem, 11vw)", weight = "heavy", rule = true, entrance = "none", asleep = false, lookDuration, signals, className }: AuthMascotProps) {
  const logoRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion() ?? false;
  const watch = useMascotWatch(logoRef, { reduced });
  // false on the server and during hydration → data-mood="idle" in both.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const errorKey = signals?.error ?? null;
  const success = Boolean(signals?.success);
  const celebrate = Boolean(signals?.celebrate);
  const glanceTarget = signals?.glance ?? null;
  const [errorActive, setErrorActive] = useState(false);

  const mood = hydrated
    ? resolveMood({
      focus: watch.focus,
      capsLock: watch.capsLock,
      error: errorActive,
      success,
      waiting: Boolean(signals?.waiting),
      thinking: Boolean(signals?.thinking),
      celebrate,
    })
    : "idle";

  const { setMood, glance, concernedGlance, pulse } = watch;

  useEffect(() => { setMood(mood); }, [mood, setMood]);

  // Wake: lids, cap and pupils in one first-launch sequence (splash).
  useEffect(() => {
    if (entrance === "wake") pulse("data-entrance", "wake", 1900);
  }, [entrance, pulse]);

  // Error: concerned for 2.4s after each new truthy value, with one glance at the alert.
  useEffect(() => {
    if (!errorKey) {
      setErrorActive(false);
      return;
    }
    setErrorActive(true);
    const frame = requestAnimationFrame(() => concernedGlance());
    const timer = window.setTimeout(() => setErrorActive(false), 2400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [errorKey, concernedGlance]);

  useEffect(() => {
    if (success) pulse("data-hop", "", 360);
  }, [success, pulse]);

  useEffect(() => {
    if (celebrate) pulse("data-celebrate", "", 950);
  }, [celebrate, pulse]);

  useEffect(() => {
    if (!glanceTarget) return;
    const frame = requestAnimationFrame(() => glance(glanceTarget, 900));
    return () => cancelAnimationFrame(frame);
  }, [glanceTarget, glance]);

  return (
    <div className={cn("sk-auth-mascot", className)} data-asleep={asleep ? "" : undefined}>
      <SkooleeLogo expressive mood={mood} ref={logoRef} size={size} weight={weight} {...(lookDuration === undefined ? null : { lookDuration })} />
      {rule ? <InkRule className="mt-3.5" /> : null}
    </div>
  );
}
