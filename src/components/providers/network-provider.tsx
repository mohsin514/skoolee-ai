"use client";

import React, { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  connection,
  ONLINE_RESTORED_EVENT,
  type ConnectionSnapshot,
} from "@/lib/network/connection";
import { installFetchInterceptor } from "@/lib/network/intercept-fetch";
import { OfflineBanner } from "@/components/ui/offline-banner";

interface NetworkContextValue extends ConnectionSnapshot {
  isOnline: boolean;
  isOffline: boolean;
  /** Force an immediate reachability check, skipping the backoff. */
  retryNow: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * Read the app's live connectivity state.
 *
 * Use it to disable a submit button or hide an action while offline —
 * writes are already blocked centrally by the fetch interceptor, so this
 * is about telling the user *before* they try, not about safety.
 */
export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within a NetworkProvider");
  return ctx;
}

// The interceptor must be installed before any component can fire a
// request, and before connection.ts's captured nativeFetch is used —
// running it at module scope beats every effect in the tree.
installFetchInterceptor();

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const snapshot = useSyncExternalStore(
    connection.subscribe,
    connection.getSnapshot,
    connection.getServerSnapshot
  );

  // Tracks the previous status so we only react to real transitions,
  // not to every probe tick.
  const wasOffline = useRef(false);

  useEffect(() => {
    connection.start();
    return () => connection.stop();
  }, []);

  useEffect(() => {
    const isOffline = snapshot.status === "offline";

    if (isOffline) {
      wasOffline.current = true;
      return;
    }

    if (!wasOffline.current) return;
    wasOffline.current = false;

    // The banner owns all connectivity messaging — a toast saying the
    // same thing would double up, and a sticky one is its own hazard.
    // Recovery just quietly re-syncs: fresh server data for whatever is
    // on screen, then let client-side hooks re-run their own fetches.
    router.refresh();
    window.dispatchEvent(new CustomEvent(ONLINE_RESTORED_EVENT));
  }, [snapshot.status, router]);

  const value: NetworkContextValue = {
    ...snapshot,
    isOnline: snapshot.status === "online",
    isOffline: snapshot.status === "offline",
    retryNow: connection.retryNow,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
      <OfflineBanner />
    </NetworkContext.Provider>
  );
}
