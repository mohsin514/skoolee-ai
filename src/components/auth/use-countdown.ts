"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A whole-second countdown. One setInterval while running, cleared on pause,
 * on reaching zero and on unmount — it never leaks into a later navigation.
 * `restart` re-phases the interval so the next tick is a full second away.
 */
export function useCountdown(seconds: number, opts?: { autostart?: boolean /* true */ }): {
  remaining: number; running: boolean; pause(): void; resume(): void; restart(s?: number): void;
} {
  const initial = Math.max(0, Math.floor(seconds));
  const [remaining, setRemaining] = useState(initial);
  const [running, setRunning] = useState((opts?.autostart ?? true) && initial > 0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setRemaining((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running, phase]);

  // Stop at zero (also covers resume() on a finished countdown).
  useEffect(() => {
    if (running && remaining <= 0) setRunning(false);
  }, [running, remaining]);

  const pause = useCallback(() => setRunning(false), []);
  const resume = useCallback(() => setRunning(true), []);
  const restart = useCallback((s?: number) => {
    const next = Math.max(0, Math.floor(s ?? initial));
    setRemaining(next);
    setRunning(next > 0);
    setPhase((value) => value + 1);
  }, [initial]);

  return { remaining, running, pause, resume, restart };
}
