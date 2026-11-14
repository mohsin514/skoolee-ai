// ─────────────────────────────────────────────────────────────────
// SKAI-1949: group the workspace shell's GETs into one request.
//
// When a page opens, its shell fires ~10 independent GETs (session, profile, menu, badges, notifications, chat
// unread, tour…). Each became its own serverless invocation and, under load, its own instance needing its own
// database-pooler connection. Requests to the paths in shell-batch-paths.ts that start within a few milliseconds of
// each other are sent as ONE `/api/shell?p=…&p=…` call; each caller still receives its own Response, built from what
// that route returned. Anything unusual is sent exactly as before: a single request, a Request object, a body,
// custom headers, a path outside the list. If the batch call fails or is refused (signed out, forced password
// change, suspended school, exam lockdown), every request is sent individually, so the proxy and each route judge
// it as they always did.
// ─────────────────────────────────────────────────────────────────
import { SHELL_BATCH_MAX, SHELL_BATCH_PATHS } from "./shell-batch-paths";

type Send = (input: string) => Promise<Response>;
type Pending = { url: string; resolve: (response: Response) => void; reject: (error: unknown) => void; signal?: AbortSignal | null; done: boolean };
type BatchResult = { s: number; h: Record<string, string>; b: string };

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);
const ALLOWED_HEADERS = new Set(["accept"]);

function abortError() {
  return typeof DOMException !== "undefined" ? new DOMException("The operation was aborted.", "AbortError") : Object.assign(new Error("Aborted"), { name: "AbortError" });
}

/** Path + query of a same-origin GET that may be batched, or null. */
export function batchablePath(input: RequestInfo | URL, init: RequestInit | undefined, origin: string): string | null {
  if (typeof input !== "string" && !(input instanceof URL)) return null; // Request objects keep their own semantics
  if (init?.body != null || (init?.method && init.method.toUpperCase() !== "GET") || init?.keepalive) return null;
  if (init?.headers) {
    const names = init.headers instanceof Headers ? [...init.headers.keys()] : Array.isArray(init.headers) ? init.headers.map(([k]) => k) : Object.keys(init.headers);
    if (names.some((name) => !ALLOWED_HEADERS.has(name.toLowerCase()))) return null;
  }
  let url: URL;
  try { url = new URL(input.toString(), origin); } catch { return null; }
  if (url.origin !== new URL(origin).origin || !SHELL_BATCH_PATHS.includes(url.pathname)) return null;
  return url.pathname + url.search;
}

export function createShellBatcher(send: Send, { windowMs = 8 }: { windowMs?: number } = {}) {
  let queue: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const settle = (item: Pending, outcome: { response?: Response; error?: unknown }) => {
    if (item.done) return;
    item.done = true;
    if (item.signal?.aborted) item.reject(abortError());
    else if (outcome.response) item.resolve(outcome.response);
    else item.reject(outcome.error);
  };

  const individually = (items: Pending[]) => {
    for (const item of items) send(item.url).then((response) => settle(item, { response }), (error) => settle(item, { error }));
  };

  async function flush() {
    timer = null;
    const batch = queue.filter((item) => !item.done);
    queue = [];
    if (batch.length === 0) return;
    if (batch.length === 1) return individually(batch);
    const query = batch.map((item) => `p=${encodeURIComponent(item.url)}`).join("&");
    try {
      const response = await send(`/api/shell?${query}`);
      if (!response.ok) return individually(batch);
      const { r } = (await response.json()) as { r?: BatchResult[] };
      if (!Array.isArray(r) || r.length !== batch.length) return individually(batch);
      batch.forEach((item, i) => {
        const { s, h, b } = r[i];
        settle(item, { response: new Response(NULL_BODY_STATUS.has(s) ? null : b, { status: s, headers: h }) });
      });
    } catch {
      individually(batch);
    }
  }

  return {
    enqueue(url: string, signal?: AbortSignal | null): Promise<Response> {
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise<Response>((resolve, reject) => {
        const item: Pending = { url, resolve, reject, signal, done: false };
        signal?.addEventListener("abort", () => settle(item, { error: abortError() }), { once: true });
        queue.push(item);
        if (queue.length >= SHELL_BATCH_MAX) {
          if (timer) clearTimeout(timer);
          void flush();
        } else if (!timer) {
          timer = setTimeout(() => void flush(), windowMs);
        }
      });
    },
  };
}
