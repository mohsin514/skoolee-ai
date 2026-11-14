import { test } from "node:test";
import assert from "node:assert/strict";

// SKAI-1952: while a realtime stream is closed for good, the page catches up on a slow timer, only while visible.
class FakeSource extends EventTarget { static CLOSED = 2; readyState = 0; }
let visibility: "visible" | "hidden" = "visible";
const doc = new EventTarget() as EventTarget & { visibilityState: string };
Object.defineProperty(doc, "visibilityState", { get: () => visibility });
Object.assign(globalThis, { EventSource: FakeSource, document: doc });

const load = () => import("../../src/lib/network/closed-stream-refresh");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a reconnecting stream is left alone; a closed one refreshes on the timer", async () => {
  const { refreshWhileClosed } = await load();
  const source = new FakeSource();
  let refreshes = 0;
  const stop = refreshWhileClosed(source as unknown as EventSource, () => { refreshes += 1; }, 20);
  source.dispatchEvent(new Event("error")); // still CONNECTING: the browser retries by itself
  await wait(50);
  assert.equal(refreshes, 0);
  source.readyState = FakeSource.CLOSED;
  source.dispatchEvent(new Event("error"));
  source.dispatchEvent(new Event("error")); // one timer only
  await wait(70);
  assert.ok(refreshes >= 2 && refreshes <= 4, `refreshes=${refreshes}`);
  stop();
  const after = refreshes;
  await wait(50);
  assert.equal(refreshes, after, "stopped with the stream");
});

test("a hidden tab skips refreshes and catches up once when shown", async () => {
  const { refreshWhileClosed } = await load();
  const source = new FakeSource();
  source.readyState = FakeSource.CLOSED;
  let refreshes = 0;
  visibility = "hidden";
  const stop = refreshWhileClosed(source as unknown as EventSource, () => { refreshes += 1; }, 15);
  source.dispatchEvent(new Event("error"));
  await wait(60);
  assert.equal(refreshes, 0);
  visibility = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(refreshes, 1);
  stop();
});
