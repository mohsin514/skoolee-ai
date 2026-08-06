// ─────────────────────────────────────────────────────────────────
// Connection manager — the single source of truth for "are we online?".
//
// `navigator.onLine` alone is not trustworthy: it only reports whether a
// network interface exists, so a captive portal, a dead Wi-Fi router or a
// down server all still read as "online". This manager combines three
// signals instead:
//
//   1. Browser online/offline events  — instant, but only a hint.
//   2. An active probe of /api/public/health — the actual truth.
//   3. Outcomes of real app traffic (reported by the fetch interceptor)
//      — free evidence, no extra requests.
//
// It is deliberately framework-free so it can be driven by React via
// useSyncExternalStore, and unit-reasoned about on its own.
// ─────────────────────────────────────────────────────────────────

export type ConnectionStatus = "online" | "offline";

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  /** A probe request is in flight right now. */
  isProbing: boolean;
  /** Epoch ms of the next scheduled auto-retry, or null when online. */
  nextRetryAt: number | null;
  /** Epoch ms we first went offline, or null when online. */
  offlineSince: number | null;
}

const PROBE_PATH = "/api/public/health";
const PROBE_TIMEOUT_MS = 8_000;

// Backoff for automatic re-probing while offline. Capped so a long outage
// still rechecks twice a minute rather than drifting into silence.
const BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * The real `fetch`, captured at module load — before the interceptor in
 * network-provider patches `window.fetch`. Probes must never travel
 * through the patched version or they would recurse and be blocked by
 * the very offline state they exist to measure.
 */
export const nativeFetch: typeof fetch | null =
  typeof window !== "undefined" ? window.fetch.bind(window) : null;

const SERVER_SNAPSHOT: ConnectionSnapshot = {
  status: "online",
  isProbing: false,
  nextRetryAt: null,
  offlineSince: null,
};

class ConnectionManager {
  private snapshot: ConnectionSnapshot = { ...SERVER_SNAPSHOT };
  private listeners = new Set<() => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private started = false;
  private probeInFlight: Promise<boolean> | null = null;

  // ── External store plumbing ──────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  getServerSnapshot = (): ConnectionSnapshot => SERVER_SNAPSHOT;

  /** Replaces the snapshot only when something actually changed, so
   *  useSyncExternalStore doesn't re-render on every heartbeat. */
  private patch(next: Partial<ConnectionSnapshot>) {
    const merged = { ...this.snapshot, ...next };
    const changed =
      merged.status !== this.snapshot.status ||
      merged.isProbing !== this.snapshot.isProbing ||
      merged.nextRetryAt !== this.snapshot.nextRetryAt ||
      merged.offlineSince !== this.snapshot.offlineSince;

    if (!changed) return;

    this.snapshot = merged;
    this.listeners.forEach((l) => l());
  }

  // ── Lifecycle ────────────────────────────────────────────────
  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;

    window.addEventListener("online", this.handleBrowserOnline);
    window.addEventListener("offline", this.handleBrowserOffline);
    document.addEventListener("visibilitychange", this.handleVisibility);

    // Trust an explicit "no interface" reading immediately; otherwise
    // assume online until something proves otherwise. We don't probe on
    // boot — the app's own first requests are evidence enough.
    if (navigator.onLine === false) this.goOffline();
  }

  stop() {
    if (!this.started || typeof window === "undefined") return;
    this.started = false;

    window.removeEventListener("online", this.handleBrowserOnline);
    window.removeEventListener("offline", this.handleBrowserOffline);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.clearRetry();
  }

  // ── Signals ──────────────────────────────────────────────────
  private handleBrowserOnline = () => {
    // The event only means an interface came back. Confirm with a probe
    // before telling the user they're online.
    void this.probe();
  };

  private handleBrowserOffline = () => this.goOffline();

  private handleVisibility = () => {
    // Returning to a backgrounded tab is the moment a stale "offline"
    // is most likely wrong — recheck straight away.
    if (document.visibilityState === "visible" && this.snapshot.status === "offline") {
      void this.probe();
    }
  };

  /** Any real request succeeded — strong evidence of life, but still
   *  subject to the navigator veto below. */
  reportSuccess() {
    if (this.snapshot.status !== "offline") return;
    if (this.hasNoNetworkInterface()) return;
    this.goOnline();
  }

  /**
   * `navigator.onLine` is only trustworthy in the negative direction.
   *
   * `true` means "an interface exists" and says nothing about real
   * reachability — captive portals and dead routers all report `true`.
   * But `false` is authoritative: the OS knows there is no network at
   * all. Without this veto, a reachable origin gets mistaken for real
   * connectivity — exactly what happens in local dev, where localhost
   * keeps answering after Wi-Fi is switched off.
   */
  private hasNoNetworkInterface(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  /** Single place where a reachability result becomes a status. */
  private settle(reachable: boolean) {
    if (reachable && !this.hasNoNetworkInterface()) this.goOnline();
    else this.goOffline();
  }

  /** A real request failed at the network layer. Confirm before reacting:
   *  a single failed request can also mean one bad endpoint. */
  reportFailure() {
    if (this.snapshot.status === "offline") return;
    void this.probe();
  }

  // ── Probing ──────────────────────────────────────────────────
  /**
   * Force an immediate reachability check, resetting any backoff.
   *
   * An arrow property, not a method: this is handed to React as a bare
   * reference (`retryNow: connection.retryNow`), which would otherwise
   * detach it from the instance and leave `this` undefined when the
   * banner's button fires it.
   */
  retryNow = (): Promise<boolean> => {
    this.attempt = 0;
    return this.probe();
  };

  private probe(): Promise<boolean> {
    // Collapse concurrent probes into one in-flight request.
    if (this.probeInFlight) return this.probeInFlight;
    if (!nativeFetch) return Promise.resolve(true);

    this.clearRetry();
    this.patch({ isProbing: true });

    this.probeInFlight = (async () => {
      try {
        const res = await nativeFetch(`${PROBE_PATH}?t=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
          // Same-origin keeps the probe cheap and avoids CORS preflight.
          credentials: "omit",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        // A 5xx means the server is reachable but unwell — that is not a
        // connectivity problem, so it still counts as "reached". The
        // failing request surfaces its own error.
        this.settle(res.ok || res.status >= 500);
      } catch {
        this.settle(false);
      } finally {
        this.probeInFlight = null;
        this.patch({ isProbing: false });
      }
      // Report the status we actually settled on, not merely whether the
      // request completed — the navigator veto can keep us offline even
      // when the origin answered.
      return this.snapshot.status === "online";
    })();

    return this.probeInFlight;
  }

  private goOnline() {
    this.clearRetry();
    this.attempt = 0;
    this.patch({ status: "online", nextRetryAt: null, offlineSince: null });
  }

  private goOffline() {
    const offlineSince = this.snapshot.offlineSince ?? Date.now();
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;

    this.clearRetry();
    this.retryTimer = setTimeout(() => void this.probe(), delay);

    this.patch({
      status: "offline",
      offlineSince,
      nextRetryAt: Date.now() + delay,
    });
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

export const connection = new ConnectionManager();

/**
 * Thrown instead of a bare "Failed to fetch" when a write is attempted
 * with no connection. Call sites that already do `toast.error(e.message)`
 * get a human sentence for free.
 */
export class OfflineError extends Error {
  readonly isOfflineError = true;

  constructor(
    message = "You're offline — this change wasn't saved. It will be ready to retry the moment you're back."
  ) {
    super(message);
    this.name = "OfflineError";
  }
}

export function isOfflineError(err: unknown): err is OfflineError {
  return err instanceof OfflineError || (err as OfflineError)?.isOfflineError === true;
}

/** Fired on `window` when connectivity is restored, so any hook can
 *  refetch without being coupled to the React context. */
export const ONLINE_RESTORED_EVENT = "skoolee:online-restored";
