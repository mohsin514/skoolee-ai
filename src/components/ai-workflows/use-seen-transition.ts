"use client";
import { useEffect, useRef, useState } from "react";

/**
 * True only when this mount saw `value` move from a non-target to a target
 * value. The first render never counts, so a reloaded or reopened run that is
 * already finished never celebrates. Once true it stays true for the mount.
 */
export function useSeenTransition<T>(value: T, isTarget: (v: T) => boolean): boolean {
  const previous = useRef<{ value: T } | null>(null);
  const [seen, setSeen] = useState(false);
  const target = isTarget(value);
  useEffect(() => {
    const before = previous.current;
    previous.current = { value };
    if (before && !isTarget(before.value) && target) setSeen(true);
  }, [value, target]);
  return seen;
}
