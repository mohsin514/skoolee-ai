// ─────────────────────────────────────────────────────────────────
// SKAI-1949: group the workspace shell's GETs into one request.
//
// When a page opens, its shell fires ~10 independent GETs (session, profile, menu, badges, notifications, chat
// unread, tour…). Each became its own serverless invocation and, under load, its own instance needing its own
// database-pooler connection. Requests to the paths in shell-batch-paths.ts that start within a few milliseconds of
// each other are sent as ONE `/api/shell?p=…&p=…` call; each caller still receives its own Response, built from what
// that route returned. Anything unusual is sent exactly as before: a single request, a Request object, a body,
// custom headers, a path outside the list. If the proxy refuses the batch (signed out, forced password change,
// suspended school, exam lockdown, a redirect), every request is sent individually, so the proxy and each route judge
// it as they always did.
//
// SKAI-1975: an overloaded platform (5xx, 408, 429) or a network error is NOT a reason to fan out: that turned one
// failed call into ~10 new invocations exactly when the pooler was full. Each caller instead gets a copy of the batch's
// own failure (status, Retry-After, coded body) — what its own request would have got — or, after one jittered retry,
// the network error. Repeated paths are asked for once, and results are read as a stream as each one settles.
// ─────────────────────────────────────────────────────────────────
import { SHELL_BATCH_MAX, SHELL_BATCH_PATHS } from "./shell-batch-paths";

type Send = (input: string) => Promise<Response>;
type Pending = { url: string; resolve: (response: Response) => void; reject: (error: unknown) => void; signal?: AbortSignal | null; done: boolean };
type BatchResult = { i?: number; s: number; h: Record<string, string>; b: string };

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);
const ALLOWED_HEADERS = new Set(["accept"]);
/** Statuses the proxy refuses with on a caller's own terms: each path must then be judged on its own. */
const REFUSAL_STATUS = new Set([400, 401, 402, 403, 409]);
/** Headers copied from a failed batch onto each caller's response (as /api/shell keeps for each route). */
const COPIED_HEADERS = ["content-type", "cache-control", "retry-after", "x-db-unavailable", "x-request-id"];

const rebuild = ({ s, h, b }: BatchResult) => new Response(NULL_BODY_STATUS.has(s) ? null : b, { status: s, headers: h });
const jitter = () => 250 + Math.random() * 500;

async function readLines(body: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { done, value } = await reader.read();
    rest += decoder.decode(value, { stream: !done });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onLine(line);
    if (done) break;
  }
  if (rest.trim()) onLine(rest);
}

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

export function createShellBatcher(send: Send, { windowMs = 8, retryDelayMs = jitter }: { windowMs?: number; retryDelayMs?: () => number } = {}) {
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
    const urls = [...new Set(batch.map((item) => item.url))];
    const settleUrl = (index: number, result: BatchResult) => {
      for (const item of batch) if (item.url === urls[index]) settle(item, { response: rebuild(result) });
    };
    const shellUrl = `/api/shell?${urls.map((url) => `p=${encodeURIComponent(url)}`).join("&")}&f=ndjson`;

    let response: Response;
    try {
      response = await send(shellUrl);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs()));
      try {
        response = await send(shellUrl);
      } catch (error) {
        for (const item of batch) settle(item, { error });
        return;
      }
    }

    if (response.redirected || (response.status >= 300 && response.status < 400) || REFUSAL_STATUS.has(response.status)) return individually(batch);
    if (!response.ok) {
      const h: Record<string, string> = {};
      for (const name of COPIED_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) h[name] = value;
      }
      const b = await response.text().catch(() => "");
      for (const item of batch) settle(item, { response: rebuild({ s: response.status, h, b }) });
      return;
    }

    try {
      if (response.headers.get("content-type")?.includes("ndjson") && response.body) {
        await readLines(response.body, (line) => {
          const result = JSON.parse(line) as BatchResult;
          if (Number.isInteger(result.i) && result.i! >= 0 && result.i! < urls.length) settleUrl(result.i!, result);
        });
      } else {
        const { r } = (await response.json()) as { r?: BatchResult[] };
        if (Array.isArray(r) && r.length === urls.length) r.forEach((result, i) => settleUrl(i, result));
      }
    } catch {
      // Not JSON (the HTML of a followed redirect) or a stream cut short: whatever is left goes out on its own.
    }
    individually(batch.filter((item) => !item.done));
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
