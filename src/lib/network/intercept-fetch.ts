// ─────────────────────────────────────────────────────────────────
// Global fetch interceptor.
//
// The app makes ~245 fetch calls across ~62 files. Rather than teaching
// each one about connectivity, we wrap `window.fetch` once so every
// request — including Next.js server actions, which post to the current
// URL — gets the same treatment:
//
//   • Writes attempted with no connection fail fast with a readable
//     sentence instead of a bare "Failed to fetch".
//   • Reads are always allowed through. Being offline shouldn't stop a
//     retry from succeeding the instant the network returns.
//   • Every outcome feeds the connection manager, so real traffic
//     doubles as connectivity evidence and we probe less.
// ─────────────────────────────────────────────────────────────────

import { connection, OfflineError } from "./connection";

const PATCH_FLAG = "__skooleeFetchPatched";

/** Methods that change server state — the ones worth blocking offline. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

/** True for same-origin (or relative) URLs. Third-party calls — file
 *  uploads to S3, Stripe — are left entirely alone. */
function isSameOrigin(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Distinguishes a genuine network failure from a deliberate abort.
 * `fetch` rejects with a TypeError when the request never reached the
 * server; an aborted or timed-out request is a DOMException and says
 * nothing about connectivity.
 */
function isNetworkFailure(err: unknown): boolean {
  if (err instanceof DOMException) return false;
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return false;
  }
  return err instanceof TypeError;
}

export function installFetchInterceptor(): void {
  if (typeof window === "undefined") return;

  const w = window as typeof window & { [PATCH_FLAG]?: boolean };
  // Guard against double-wrapping across Fast Refresh, which would stack
  // interceptors and report each failure more than once.
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;

  const original = window.fetch.bind(window);

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = resolveUrl(input);
    const sameOrigin = isSameOrigin(url);

    // Leave cross-origin traffic untouched: it has its own reachability
    // story and shouldn't drive this app's connection state.
    if (!sameOrigin) return original(input, init);

    const method = resolveMethod(input, init);

    if (MUTATING.has(method) && connection.getSnapshot().status === "offline") {
      throw new OfflineError();
    }

    try {
      const res = await original(input, init);
      connection.reportSuccess();
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) connection.reportFailure();
      throw err;
    }
  };
}
