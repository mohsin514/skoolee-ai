import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1958: the notification stream reads the unread count before it opens. A staff member the tenant guard refuses
// (no campus yet) gets 403, like /api/notifications, instead of an open stream that never sends its first event.
process.env.REDIS_URL = "redis://test.invalid:6379";
let count: () => Promise<number> = async () => 3;
const denied = () => Object.assign(new Error("Access denied"), { status: 403 });
mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => ({ userId: "u1", schoolId: "s1" }) } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: { notification: { count: () => count() } } } });
mock.module("@/lib/queue/shared-subscriber", { namedExports: { sharedSubscriber: () => ({ subscribe: async () => () => {} }) } });

const load = () => import("../../src/app/api/notifications/sse/route");

async function firstChunk(res: Response) {
  const reader = res.body!.getReader();
  let text = "";
  while (!text.includes("event:") ) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  await reader.cancel();
  return text;
}

test("a refused unread count answers 403 and opens no stream", async () => {
  const { GET } = await load();
  count = async () => { throw denied(); };
  const res = await GET(new Request("https://dev.test/api/notifications/sse"));
  assert.equal(res.status, 403);
  assert.notEqual(res.headers.get("content-type"), "text/event-stream");
});

test("an allowed user gets the stream with the unread count as its first event", async () => {
  const { GET } = await load();
  count = async () => 3;
  const controller = new AbortController();
  const res = await GET(new Request("https://dev.test/api/notifications/sse", { signal: controller.signal }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.match(await firstChunk(res), /event: init\ndata: \{"unreadCount":3\}/);
  controller.abort();
});

test("a database failure keeps the stream open, without the initial count", async () => {
  const { GET } = await load();
  count = async () => { throw new Error("db down"); };
  const controller = new AbortController();
  const res = await GET(new Request("https://dev.test/api/notifications/sse", { signal: controller.signal }));
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  assert.equal(new TextDecoder().decode(value), "retry: 5000\n\n");
  await reader.cancel();
  controller.abort();
});
