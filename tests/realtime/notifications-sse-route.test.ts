import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1197: live parent notifications rely on GET /api/notifications/sse forwarding only the signed-in user's
// own `notif:<userId>` frames. The live two-actor check stays with QA; this pins the route contract.
type User = { userId: string; role: string; schoolId: string; campusId: string | null } | null;
let current: User = null;
const listeners = new Map<string, Array<(message: string) => void>>();

mock.module("@/lib/auth", { namedExports: { getAuthUser: async () => current } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: { notification: { count: async ({ where }: { where: { userId: string } }) => (where.userId === "parent-a" ? 2 : 0) } } } });
mock.module("@/lib/queue/redis-config", { namedExports: { resolveRedisUrl: () => "redis://test:6379", warnRealtimeDisabledOnce: () => {} } });
const fakeHub = {
  subscribe: async (channel: string, onMessage: (message: string) => void) => {
    listeners.set(channel, [...(listeners.get(channel) ?? []), onMessage]);
    return () => listeners.set(channel, (listeners.get(channel) ?? []).filter((fn) => fn !== onMessage));
  },
};
mock.module("@/lib/queue/shared-subscriber", { namedExports: { sharedSubscriber: () => fakeHub } });

const publish = (channel: string, message: string) => (listeners.get(channel) ?? []).forEach((fn) => fn(message));

async function open(user: User) {
  current = user;
  const { GET } = await import("../../src/app/api/notifications/sse/route");
  const controller = new AbortController();
  const res = await GET(new Request("http://localhost/api/notifications/sse", { signal: controller.signal }));
  return { res, controller };
}

async function readUntil(res: Response, needle: string) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(needle)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

test("a parent's stream opens with their own unread count and receives only their own notifications", async () => {
  const parentA = await open({ userId: "parent-a", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" });
  const parentB = await open({ userId: "parent-b", role: "PARENT", schoolId: "school-b", campusId: "campus-b1" });
  try {
    assert.equal(parentA.res.status, 200);
    assert.equal(parentA.res.headers.get("content-type"), "text/event-stream");

    publish("notif:parent-a", JSON.stringify({ id: "n-a", title: "Fee due" }));
    publish("notif:parent-b", JSON.stringify({ id: "n-b", title: "Other school" }));

    const seenA = await readUntil(parentA.res, "n-a");
    assert.match(seenA, /event: init\ndata: \{"unreadCount":2\}/);
    assert.match(seenA, /id: n-a\nevent: notification\ndata: \{"id":"n-a"/);
    assert.ok(!seenA.includes("n-b"), "school A parent must not see school B traffic");

    const seenB = await readUntil(parentB.res, "n-b");
    assert.ok(!seenB.includes("n-a"), "school B parent must not see parent A's notification");
  } finally {
    parentA.controller.abort();
    parentB.controller.abort();
  }
});

test("a signed-out caller gets 401 and no stream", async () => {
  const anon = await open(null);
  try {
    assert.equal(anon.res.status, 401);
  } finally {
    anon.controller.abort();
  }
});
