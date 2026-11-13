import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { forgetSessionRead, readSession } from "../../src/lib/client/session-read";

// SKAI-1900: one network read for callers that ask at the same moment; each keeps its own abort; nothing outlives the window.
let calls = 0;
let answer: () => Promise<Response> = async () => Response.json({ user: { id: "u1" } });
globalThis.fetch = (async () => { calls += 1; return answer(); }) as typeof fetch;
beforeEach(() => { calls = 0; forgetSessionRead(); answer = async () => Response.json({ user: { id: "u1" } }); });

test("callers at the same moment share one request and each get the full answer", async () => {
  const [a, b, c] = await Promise.all([readSession(), readSession(), readSession()]);
  assert.equal(calls, 1);
  for (const read of [a, b, c]) assert.deepEqual(read, { ok: true, status: 200, body: { user: { id: "u1" } } });
});

test("a fresh read and a read after the window ask the server again", async () => {
  await readSession();
  await readSession({ fresh: true });
  assert.equal(calls, 2);
  forgetSessionRead();
  await readSession();
  assert.equal(calls, 3);
});

test("one caller's abort stops only that caller", async () => {
  let release!: () => void;
  answer = () => new Promise((resolve) => { release = () => resolve(Response.json({ user: null }, { status: 401 })); });
  const controller = new AbortController();
  const aborted = readSession({ signal: controller.signal });
  const other = readSession();
  controller.abort();
  await assert.rejects(aborted, { name: "AbortError" });
  release();
  assert.deepEqual(await other, { ok: false, status: 401, body: { user: null } });
  assert.equal(calls, 1);
});

test("an already-aborted signal never starts a request", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(readSession({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("a network failure is not shared with the next read", async () => {
  answer = async () => { throw new TypeError("network down"); };
  await assert.rejects(readSession(), TypeError);
  answer = async () => Response.json({ user: { id: "u2" } });
  assert.deepEqual((await readSession()).body, { user: { id: "u2" } });
  assert.equal(calls, 2);
});

test("an unreadable body is null, not a thrown error", async () => {
  answer = async () => new Response("<html>", { status: 502 });
  assert.deepEqual(await readSession(), { ok: false, status: 502, body: null });
});
