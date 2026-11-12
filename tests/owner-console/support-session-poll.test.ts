import assert from "node:assert/strict";
import { test } from "node:test";
import { SUPPORT_SESSION_CHANGE_EVENT, SUPPORT_SESSION_POLL_MS, watchSupportSession, type SupportSessionCheck } from "../../src/lib/owner/support-session-poll";

// SKAI-1867: the owner console asks for the support session only while one is active and the tab is
// visible, plus a check just after expiry; with no session it makes no repeated requests.
type Timer = { at: number; every?: number; fn: () => void };
function harness() {
  let now = 0, nextId = 1;
  const timers = new Map<number, Timer>();
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string, fn: () => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(fn); };
  const off = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
  const host = {
    addEventListener: on, removeEventListener: off,
    setInterval: (fn: () => void, ms: number) => { timers.set(nextId, { at: now + ms, every: ms, fn }); return nextId++; },
    setTimeout: (fn: () => void, ms: number) => { timers.set(nextId, { at: now + ms, fn }); return nextId++; },
    clearInterval: (id: number) => timers.delete(id), clearTimeout: (id: number) => timers.delete(id),
  };
  const doc = { hidden: false, addEventListener: on, removeEventListener: off };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due; now = t.at;
      if (t.every) t.at += t.every; else timers.delete(id);
      t.fn(); await flush();
    }
    now = end;
  };
  const fire = async (type: string) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(); await flush(); };
  return { host: host as never, doc, advance, fire, flush, timers, listeners };
}

const active = (id: string, expiresInMs: number) => ({ id, expiresAt: new Date(Date.now() + expiresInMs).toISOString() });

test("with no session there is one check and no polling, even for an hour", async () => {
  const h = harness(); let reads = 0; const seen: SupportSessionCheck[] = [];
  const stop = watchSupportSession(async () => { reads++; return { ok: true, session: null }; }, (c) => seen.push(c), h.host, h.doc as never);
  await h.flush(); await h.advance(3_600_000);
  assert.equal(reads, 1, "was 240 requests an hour");
  assert.deepEqual(seen, [{ ok: true, session: null }]);
  await h.fire(SUPPORT_SESSION_CHANGE_EVENT);
  assert.equal(reads, 2, "a local start or end still re-checks at once");
  stop();
});

test("an active session is re-checked every poll while visible, paused while hidden, and refreshed on return", async () => {
  const h = harness(); let reads = 0; let session: ReturnType<typeof active> | null = active("grant-a", 3_600_000);
  const seen: Array<string | null> = [];
  const stop = watchSupportSession(async () => { reads++; return { ok: true, session }; }, (c) => seen.push(c.session?.id ?? null), h.host, h.doc as never);
  await h.flush(); await h.advance(SUPPORT_SESSION_POLL_MS * 2);
  assert.equal(reads, 3);
  h.doc.hidden = true; await h.advance(SUPPORT_SESSION_POLL_MS * 10);
  assert.equal(reads, 3, "no requests while the tab is hidden");
  session = null; h.doc.hidden = false; await h.fire("visibilitychange");
  assert.equal(reads, 4); assert.equal(seen.at(-1), null, "a session revoked elsewhere clears on return");
  await h.advance(SUPPORT_SESSION_POLL_MS * 10);
  assert.equal(reads, 4, "polling stops once the session has ended");
  stop();
});

test("the session is checked just after it expires, and failures report ok false with no session", async () => {
  const h = harness();
  const stop = watchSupportSession(async () => ({ ok: true, session: active("grant-b", 5_000) }), () => undefined, h.host, h.doc as never);
  await h.flush();
  const expiryTimers = [...h.timers.values()].filter((t) => !t.every);
  assert.equal(expiryTimers.length, 1);
  assert.ok(expiryTimers[0].at > 5_500 && expiryTimers[0].at <= 6_000, "one check about a second after expiry");
  stop();
  const h2 = harness(); const seen: SupportSessionCheck[] = [];
  const stop2 = watchSupportSession(async () => { throw new Error("offline"); }, (c) => seen.push(c), h2.host, h2.doc as never);
  await h2.flush();
  assert.deepEqual(seen, [{ ok: false, session: null }]);
  assert.equal(h2.timers.size, 0, "a failed check does not start polling");
  stop2();
});

test("a slow earlier answer never overwrites a newer one, and cleanup removes every timer and listener", async () => {
  const h = harness(); const answers: Array<(c: SupportSessionCheck) => void> = []; const seen: Array<string | null> = [];
  const stop = watchSupportSession(() => new Promise<SupportSessionCheck>((resolve) => answers.push(resolve)), (c) => seen.push(c.session?.id ?? null), h.host, h.doc as never);
  await h.fire(SUPPORT_SESSION_CHANGE_EVENT);
  answers[1]({ ok: true, session: null }); await h.flush();
  answers[0]({ ok: true, session: active("stale", 60_000) }); await h.flush();
  assert.deepEqual(seen, [null]);
  stop();
  assert.equal(h.timers.size, 0);
  assert.equal([...h.listeners.values()].reduce((n, s) => n + s.size, 0), 0);
});
