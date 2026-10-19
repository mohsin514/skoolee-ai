"use client";

import { useEffect, useState } from "react";

/**
 * True for `ms` after `value` settles on a new non-empty value — never on
 * mount — so a cover ledger row can ink in once when the owner's answer
 * changes. Drives a one-shot CSS animation (`[data-fresh]`), which reduced
 * motion turns off.
 */
export function useFreshValue(value: string | null | undefined, ms = 600): boolean {
  const current = value ?? "";
  const [previous, setPrevious] = useState(current);
  const [fresh, setFresh] = useState(false);
  // Adjust state while rendering when the value changes (React's documented
  // pattern), so the first frame of the new value already carries data-fresh.
  if (current !== previous) {
    setPrevious(current);
    setFresh(current !== "");
  }
  useEffect(() => {
    if (!fresh) return;
    const timer = window.setTimeout(() => setFresh(false), ms);
    return () => window.clearTimeout(timer);
  }, [fresh, current, ms]);
  return fresh;
}
