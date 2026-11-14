import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1951: the session + account prefetch is read once per request, however many handlers ask (one /api/shell call
// runs ten of them). Different requests and different tokens still read their own rows; a failure is not remembered.
let reads = 0;
let fail = false;
let jar: object = {};
mock.module("next/headers", { namedExports: { cookies: async () => jar } });
mock.module("@/lib/db/tenant-context", { namedExports: { runUnscoped: async (_reason: string, fn: () => unknown) => fn() } });
mock.module("@/lib/db/prisma", { namedExports: { prisma: { $queryRaw: async () => {
  reads += 1;
  if (fail) throw new Error("db down");
  return [{ sessions: [{ isActive: true }], id: "u1", schoolId: "s1", accessVersion: "2" }];
} } } });

const load = () => import("../../src/lib/auth/request-auth");

test("handlers of one request share a single prefetch read", async () => {
  const { prefetchAuth, prefetchedAccount, sessionRowsForRequest } = await load();
  jar = {}; reads = 0;
  await Promise.all(Array.from({ length: 10 }, () => prefetchAuth("t1", "u1", "s1")));
  await prefetchAuth("t1", "u1", "s1");
  assert.equal(reads, 1);
  assert.equal((await prefetchedAccount("u1", "s1"))?.accessVersion, 2);
  assert.deepEqual(await sessionRowsForRequest("t1", async () => { throw new Error("should come from the prefetch"); }), [{ isActive: true }]);
});

test("another request, or another token in the same request, reads again", async () => {
  const { prefetchAuth } = await load();
  jar = {}; reads = 0;
  await prefetchAuth("t1", "u1", "s1");
  await prefetchAuth("t2", "u1", "s1");
  jar = {};
  await prefetchAuth("t1", "u1", "s1");
  assert.equal(reads, 3);
});

test("a failed read is not remembered", async () => {
  const { prefetchAuth } = await load();
  jar = {}; reads = 0; fail = true;
  await assert.rejects(prefetchAuth("t1", "u1", "s1"), /db down/);
  fail = false;
  await prefetchAuth("t1", "u1", "s1");
  assert.equal(reads, 2);
});
