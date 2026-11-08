import { useSyncExternalStore } from "react";

/** Splash greeting by local time: 05–12 / 12–17 / 17–23 / 23–05. */
export type GreetingBucket = "morning" | "afternoon" | "evening" | "late";

export function greetingBucket(d: Date): GreetingBucket {
  const hour = d.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 23) return "evening";
  return "late";
}

const noopSubscribe = () => () => {};
const clientBucket = () => greetingBucket(new Date());
const serverBucket = () => null;

/** `null` on the server and during hydration (so markup never mismatches), then the local bucket. */
export function useGreetingBucket(): GreetingBucket | null {
  return useSyncExternalStore(noopSubscribe, clientBucket, serverBucket);
}
