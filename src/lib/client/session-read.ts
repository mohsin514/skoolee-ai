/**
 * SKAI-1900: one `GET /api/auth/session` for everything that asks at the same moment.
 *
 * The shell (ScopeBadge), the candidate exam guard, the first-run guide, form drafts, the private assistant and the
 * admin console each read the session when a page loads. Separately that was four to six identical requests per page,
 * each loading the user, school, campus, institution contacts, locale and permission map on the server.
 *
 * Reads started within SHARE_WINDOW_MS of each other share one request. Every caller still gets the full answer
 * (status and parsed body) and keeps its own abort signal, so a caller's timeout or cancellation only stops that
 * caller waiting. Nothing is cached beyond the window: a later read (focus, navigation, retry) always asks the server
 * again, and a failed request is never shared past its own moment. `fresh` skips sharing entirely.
 */
export type SessionRead = { ok: boolean; status: number; body: unknown };

const SHARE_WINDOW_MS = 1500;
let shared: { startedAt: number; promise: Promise<SessionRead> } | null = null;

/** Drop the shared read, e.g. after signing out, so the next identity in this tab never reuses it. */
export function forgetSessionRead() {
  shared = null;
}

function startRead(): Promise<SessionRead> {
  const promise = fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => null),
  }));
  const entry = { startedAt: Date.now(), promise };
  shared = entry;
  promise.catch(() => { if (shared === entry) shared = null; });
  return promise;
}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

export function readSession(options: { signal?: AbortSignal; fresh?: boolean } = {}): Promise<SessionRead> {
  const { signal, fresh = false } = options;
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  const reuse = !fresh && shared !== null && Date.now() - shared.startedAt <= SHARE_WINDOW_MS;
  const request = reuse && shared ? shared.promise : startRead();
  if (!signal) return request;
  return new Promise<SessionRead>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}
