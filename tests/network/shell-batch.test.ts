import { test } from "node:test";
import assert from "node:assert/strict";
import { batchablePath, createShellBatcher } from "../../src/lib/network/shell-batch";
import { respondShellBatch } from "../../src/lib/network/shell-batch-respond";

const origin = "https://dev.skooleeai.com";

test("only plain same-origin GETs to the shell allowlist are batchable", () => {
  assert.equal(batchablePath("/api/auth/session", undefined, origin), "/api/auth/session");
  assert.equal(batchablePath("/api/notifications?limit=30", { cache: "no-store" }, origin), "/api/notifications?limit=30");
  assert.equal(batchablePath(`${origin}/api/profile`, { headers: { Accept: "application/json" } }, origin), "/api/profile");
  assert.equal(batchablePath("/api/students", undefined, origin), null, "not on the list");
  assert.equal(batchablePath("/api/profile", { method: "PATCH", body: "{}" }, origin), null, "writes are never batched");
  assert.equal(batchablePath("/api/profile", { headers: { "X-Resume-Key": "k" } }, origin), null, "custom headers keep their own request");
  assert.equal(batchablePath("https://evil.example/api/profile", undefined, origin), null, "cross-origin");
  assert.equal(batchablePath(new Request(`${origin}/api/profile`), undefined, origin), null, "Request objects keep their semantics");
});

function fakeSend(shellAnswer: (paths: string[]) => Response | Promise<Response>) {
  const calls: string[] = [];
  const send = async (url: string) => {
    calls.push(url);
    if (url.startsWith("/api/shell?")) return shellAnswer(new URLSearchParams(url.split("?")[1]).getAll("p"));
    return new Response(JSON.stringify({ single: url }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { send, calls };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test("requests that start together go out as one /api/shell call and each caller gets its own response", async () => {
  const { send, calls } = fakeSend((paths) => Response.json({ r: paths.map((p, i) => ({ s: i === 1 ? 401 : 200, h: { "content-type": "application/json" }, b: JSON.stringify({ path: p }) })) }));
  const batcher = createShellBatcher(send);
  const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/api\/shell\?p=%2Fapi%2Fauth%2Fsession&p=%2Fapi%2Fprofile&f=ndjson$/);
  assert.equal(a.status, 200);
  assert.deepEqual(await a.json(), { path: "/api/auth/session" });
  assert.equal(b.status, 401, "each route's own status is kept");
});

test("a lone request is sent as itself", async () => {
  const { send, calls } = fakeSend(() => { throw new Error("should not batch"); });
  const res = await createShellBatcher(send).enqueue("/api/navigation/access");
  assert.deepEqual(calls, ["/api/navigation/access"]);
  assert.deepEqual(await res.json(), { single: "/api/navigation/access" });
});

test("a batch the proxy refuses falls back to individual requests, so the proxy judges each path", async () => {
  const redirected = () => Object.defineProperty(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }), "redirected", { value: true });
  const refusals = [
    ...[400, 401, 402, 403, 409].map((status) => () => Response.json({ code: "X" }, { status })),
    () => new Response(null, { status: 307, headers: { location: "/login" } }),
    redirected,
    () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    () => Response.json({ r: [] }),
  ];
  for (const shell of refusals) {
    const { send, calls } = fakeSend(shell);
    const batcher = createShellBatcher(send);
    const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
    assert.deepEqual(calls.slice(1).sort(), ["/api/auth/session", "/api/profile"]);
    assert.deepEqual(await a.json(), { single: "/api/auth/session" });
    assert.deepEqual(await b.json(), { single: "/api/profile" });
  }
});

test("an overloaded batch (5xx, 408, 429) is never fanned out: every caller gets its status, Retry-After and body", async () => {
  for (const status of [500, 502, 503, 504, 408, 429]) {
    const { send, calls } = fakeSend(() => Response.json({ code: "EXAM_SESSION_UNAVAILABLE" }, { status, headers: { "retry-after": "3", "cache-control": "private, no-store" } }));
    const batcher = createShellBatcher(send);
    const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
    await tick();
    assert.equal(calls.length, 1, `${status}: exactly one call`);
    for (const res of [a, b]) {
      assert.equal(res.status, status);
      assert.equal(res.headers.get("retry-after"), "3");
      assert.deepEqual(await res.json(), { code: "EXAM_SESSION_UNAVAILABLE" });
    }
  }
});

test("a network error retries the batch once, then rejects every caller without fanning out", async () => {
  const failing = fakeSend(() => { throw new TypeError("network"); });
  const batcher = createShellBatcher(failing.send, { retryDelayMs: () => 1 });
  const results = await Promise.allSettled([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
  await tick();
  assert.equal(failing.calls.length, 2, "one retry, no individual requests");
  assert.ok(results.every((r) => r.status === "rejected" && r.reason instanceof TypeError));

  let attempt = 0;
  const flaky = fakeSend((paths) => {
    if (attempt++ === 0) throw new TypeError("network");
    return Response.json({ r: paths.map((p) => ({ s: 200, h: {}, b: p })) });
  });
  const retried = createShellBatcher(flaky.send, { retryDelayMs: () => 1 });
  const [x, y] = await Promise.all([retried.enqueue("/api/auth/session"), retried.enqueue("/api/profile")]);
  assert.equal(flaky.calls.length, 2, "the retried batch answers both callers");
  assert.equal(await x.text(), "/api/auth/session");
  assert.equal(await y.text(), "/api/profile");
});

function ndjson(lines: string[], { cutAfter }: { cutAfter?: number } = {}) {
  const encoder = new TextEncoder();
  let n = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (cutAfter !== undefined && n === cutAfter) return controller.error(new TypeError("stream cut"));
      if (n === lines.length) return controller.close();
      controller.enqueue(encoder.encode(lines[n++]));
    },
  }), { headers: { "content-type": "application/x-ndjson" } });
}

test("streamed results settle each caller as they arrive, in any order and split across chunks", async () => {
  const line = (i: number, b: string) => JSON.stringify({ i, s: 200, h: { "content-type": "text/plain" }, b }) + "\n";
  const second = line(1, "profile");
  const { send, calls } = fakeSend(() => ndjson([second.slice(0, 7), second.slice(7), line(0, "session")]));
  const batcher = createShellBatcher(send);
  const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
  assert.equal(calls.length, 1);
  assert.equal(await a.text(), "session");
  assert.equal(await b.text(), "profile");
});

test("a stream cut short sends only the unsettled paths on their own", async () => {
  const line = (i: number, b: string) => JSON.stringify({ i, s: 200, h: {}, b }) + "\n";
  const { send, calls } = fakeSend(() => ndjson([line(0, "session")], { cutAfter: 1 }));
  const batcher = createShellBatcher(send);
  const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/navigation/counts")]);
  assert.equal(await a.text(), "session");
  assert.deepEqual(await b.json(), { single: "/api/navigation/counts" });
  assert.deepEqual(calls.slice(1), ["/api/navigation/counts"]);
});

test("identical pending requests are asked for once and each caller gets its own readable copy", async () => {
  const { send, calls } = fakeSend((paths) => Response.json({ r: paths.map((p) => ({ s: 200, h: {}, b: p })) }));
  const batcher = createShellBatcher(send);
  const [a, b, c] = await Promise.all([batcher.enqueue("/api/profile"), batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
  assert.equal(calls.length, 1);
  assert.equal(new URLSearchParams(calls[0].split("?")[1]).getAll("p").length, 2);
  assert.equal(await a.text(), "/api/profile");
  assert.equal(await c.text(), "/api/profile");
  assert.equal(await b.text(), "/api/auth/session");
});

test("the server runs a repeated path once and streams each index as it settles", async () => {
  const runs: number[] = [];
  let releaseSlow!: () => void;
  const slow = new Promise<void>((r) => { releaseSlow = r; });
  const run = async (i: number) => {
    runs.push(i);
    if (i === 0) await slow;
    return { s: 200, h: {}, b: `r${i}` };
  };
  const res = await respondShellBatch(["/api/navigation/counts", "/api/auth/session", "/api/auth/session"], run, true);
  assert.equal(res.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const reader = res.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /"i":1/, "the quick path is written before the slow one settles");
  releaseSlow();
  let text = first;
  for (;;) { const { done, value } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
  const lines = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.i).sort(), [0, 1, 2]);
  assert.equal(lines.find((l) => l.i === 2).b, "r1", "the repeat shares the first run");
  assert.deepEqual(runs, [0, 1]);

  const legacy = await respondShellBatch(["/api/profile", "/api/profile"], async (i) => ({ s: 200, h: {}, b: `r${i}` }), false);
  assert.deepEqual(await legacy.json(), { r: [{ s: 200, h: {}, b: "r0" }, { s: 200, h: {}, b: "r0" }] });
});

test("an aborted caller is rejected with AbortError and left out of the batch", async () => {
  const { send, calls } = fakeSend((paths) => Response.json({ r: paths.map((p) => ({ s: 200, h: {}, b: p })) }));
  const batcher = createShellBatcher(send);
  const controller = new AbortController();
  const aborted = batcher.enqueue("/api/auth/tour", controller.signal);
  const kept = batcher.enqueue("/api/profile");
  controller.abort();
  await assert.rejects(aborted, (e: Error) => e.name === "AbortError");
  await kept;
  await tick();
  assert.deepEqual(calls, ["/api/profile"], "only the live request was sent");
  await assert.rejects(batcher.enqueue("/api/profile", controller.signal), (e: Error) => e.name === "AbortError");
});

test("statuses without a body (204, 304) are rebuilt without one", async () => {
  const { send } = fakeSend((paths) => Response.json({ r: paths.map(() => ({ s: 204, h: {}, b: "" })) }));
  const batcher = createShellBatcher(send);
  const [a] = await Promise.all([batcher.enqueue("/api/auth/welcome"), batcher.enqueue("/api/auth/tour")]);
  assert.equal(a.status, 204);
  assert.equal(await a.text(), "");
});
