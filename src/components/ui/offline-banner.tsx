"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, WifiOff, Wifi } from "lucide-react";
import { useNetwork } from "@/components/providers/network-provider";
import styles from "./offline-banner.module.css";

/** How long the green "Back online" confirmation stays up. */
const RESTORED_MS = 3200;

export function OfflineBanner() {
  const { isOffline, isProbing, nextRetryAt, retryNow } = useNetwork();
  const [showRestored, setShowRestored] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Flash a confirmation on the offline→online edge, so the banner
  // resolves visibly instead of just vanishing. This must be a ref, not
  // state: as a dependency it would re-run the effect the instant it
  // flipped, and the cleanup would cancel the dismiss timer that had
  // just been scheduled — leaving "Back online" on screen forever.
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (isOffline) {
      wasOfflineRef.current = true;
      setShowRestored(false);
      return;
    }
    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;
    setShowRestored(true);
    const t = setTimeout(() => setShowRestored(false), RESTORED_MS);
    return () => clearTimeout(t);
  }, [isOffline]);

  // Live countdown to the next automatic retry.
  useEffect(() => {
    if (!isOffline || !nextRetryAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((nextRetryAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isOffline, nextRetryAt]);

  if (!isOffline && !showRestored) return null;

  const subtitle = isProbing
    ? "Checking your connection…"
    : secondsLeft && secondsLeft > 0
      ? `Retrying in ${secondsLeft}s · saving is paused`
      : "Saving is paused until you're back";

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={`${styles.pill} ${!isOffline ? styles.pillRestored : ""}`}>
        <span className={styles.icon}>
          {isOffline ? (
            isProbing ? (
              <Loader2 className={`h-4 w-4 ${styles.spin}`} />
            ) : (
              <WifiOff className="h-4 w-4" />
            )
          ) : (
            <Wifi className="h-4 w-4" />
          )}
        </span>

        <span className={styles.text}>
          <span className={styles.title}>
            {isOffline ? "No internet connection" : "Back online"}
          </span>
          <span className={styles.sub}>
            {isOffline ? subtitle : "Reconnected — your data is up to date."}
          </span>
        </span>

        {isOffline && (
          <button
            type="button"
            className={styles.retry}
            onClick={() => void retryNow()}
            disabled={isProbing}
          >
            {isProbing ? "Checking…" : "Retry now"}
          </button>
        )}
      </div>
    </div>
  );
}
