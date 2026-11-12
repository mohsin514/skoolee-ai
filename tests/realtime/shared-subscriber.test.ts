import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSubscriberHub, type SubscriberClient } from "../../src/lib/queue/shared-subscriber";

// SKAI-1878: every open tab used to hold two dedicated Redis subscriber connections (chat + notifications).
// The hub keeps one connection per instance no matter how many streams are open, and still delivers each
// channel only to the streams that asked for it.

class FakeClient extends EventEmitter {
  subscribed = new Set<string>();
  calls: string[] = [];
  disconnected = false;
  constructor(private failConnect = false) {
    super();
  }
  async connect() {
    this.calls.push("connect");
    if (this.failConnect) throw new Error("ECONNREFUSED");
  }
  async subscribe(channel: string) {
    this.calls.push(`subscribe ${channel}`);
    this.subscribed.add(channel);
  }
  async unsubscribe(channel: string) {
    this.calls.push(`unsubscribe ${channel}`);
    this.subscribed.delete(channel);
  }
  disconnect() {
    this.disconnected = true;
  }
  publish(channel: string, message: string) {
    if (this.subscribed.has(channel)) this.emit("message", channel, message);
  }
}

function hubWith(...clients: FakeClient[]) {
  const made: FakeClient[] = [];
  const hub = createSubscriberHub(() => {
    const next = clients.shift() ?? new FakeClient();
    made.push(next);
    return next as unknown as SubscriberClient;
  });
  return { hub, made };
}

test("many tabs share one connection and one SUBSCRIBE per channel", async () => {
  const { hub, made } = hubWith();
  const users = ["parent-school-a", "teacher-school-b"];
  const received = new Map<string, string[]>();
  const releases: Array<() => void> = [];
  for (let tab = 0; tab < 50; tab++) {
    for (const user of users) {
      for (const channel of [`chat:${user}`, `notif:${user}`]) {
        const key = `${channel}#${tab}`;
        received.set(key, []);
        releases.push(await hub.subscribe(channel, (message) => received.get(key)!.push(message)));
      }
    }
  }
  assert.equal(made.length, 1, "one Redis connection for 200 streams");
  const client = made[0];
  assert.equal(client.calls.filter((c) => c === "connect").length, 1);
  assert.equal(client.calls.filter((c) => c.startsWith("subscribe")).length, 4, "one SUBSCRIBE per channel, not per tab");
  assert.equal(hub.channelCount(), 4);

  client.publish("chat:parent-school-a", "hello");
  for (const [key, messages] of received) {
    assert.deepEqual(messages, key.startsWith("chat:parent-school-a#") ? ["hello"] : [], key);
  }

  for (const release of releases) {
    release();
    release(); // idempotent
  }
  assert.equal(hub.channelCount(), 0);
  assert.equal(client.calls.filter((c) => c.startsWith("unsubscribe")).length, 4, "UNSUBSCRIBE once the last tab closes");
  assert.equal(client.subscribed.size, 0);
});

test("a channel stays subscribed while another tab still listens", async () => {
  const { hub, made } = hubWith();
  const a: string[] = [];
  const b: string[] = [];
  const first = await hub.subscribe("chat:u1", (m) => a.push(m));
  await hub.subscribe("chat:u1", (m) => b.push(m));
  first();
  made[0].publish("chat:u1", "still here");
  assert.deepEqual(a, []);
  assert.deepEqual(b, ["still here"]);
  assert.ok(!made[0].calls.includes("unsubscribe chat:u1"));
});

test("a failed connect rejects every waiting stream and the next stream retries on a fresh client", async () => {
  const broken = new FakeClient(true);
  const { hub, made } = hubWith(broken);
  const results = await Promise.allSettled([hub.subscribe("chat:u1", () => {}), hub.subscribe("notif:u1", () => {})]);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "rejected"]);
  assert.equal(hub.channelCount(), 0);
  assert.ok(broken.disconnected);

  const release = await hub.subscribe("chat:u1", () => {});
  assert.equal(made.length, 2);
  assert.ok(made[1].subscribed.has("chat:u1"));
  release();
});

test("a throwing listener does not starve the others", async () => {
  const { hub, made } = hubWith();
  const got: string[] = [];
  await hub.subscribe("notif:u1", () => {
    throw new Error("closed controller");
  });
  await hub.subscribe("notif:u1", (m) => got.push(m));
  made[0].publish("notif:u1", "{}");
  assert.deepEqual(got, ["{}"]);
});
