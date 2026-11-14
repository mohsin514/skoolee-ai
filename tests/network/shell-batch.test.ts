import { test } from "node:test";
import assert from "node:assert/strict";
import { batchablePath, createShellBatcher } from "../../src/lib/network/shell-batch";

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
  assert.match(calls[0], /^\/api\/shell\?p=%2Fapi%2Fauth%2Fsession&p=%2Fapi%2Fprofile$/);
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

test("a refused or failed batch falls back to individual requests, so the proxy judges each path", async () => {
  for (const shell of [() => new Response("nope", { status: 403 }), () => { throw new TypeError("network"); }, () => Response.json({ r: [] })]) {
    const { send, calls } = fakeSend(shell);
    const batcher = createShellBatcher(send);
    const [a, b] = await Promise.all([batcher.enqueue("/api/auth/session"), batcher.enqueue("/api/profile")]);
    assert.deepEqual(calls.slice(1).sort(), ["/api/auth/session", "/api/profile"]);
    assert.deepEqual(await a.json(), { single: "/api/auth/session" });
    assert.deepEqual(await b.json(), { single: "/api/profile" });
  }
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
