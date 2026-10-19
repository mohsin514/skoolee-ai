"use client";

import { useSyncExternalStore } from "react";

/**
 * True on phones (below Tailwind's `sm`, 640px), where optional field groups
 * fold into "More details (optional)". The server snapshot is `false`, so the
 * server and hydration frames always render the desktop form.
 */
const QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useCompactForm(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
