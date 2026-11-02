import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1651: an expired PENDING lease no longer blocks private-conversation deletion or the retention sweep.
const source = readFileSync("src/lib/school-ai/conversation-service.ts", "utf8");

test("deletion is blocked only by a live pending lease", () => {
  const del = source.slice(source.indexOf("export async function deletePrivateConversation"));
  assert.match(del.slice(0, 1200), /status: "PENDING", leaseExpiresAt: \{ gt: new Date\(\) \}/);
});

test("retention sweep ignores expired pending turns at selection and at delete", () => {
  const sweep = source.slice(source.indexOf("export async function sweepConversationRetention"));
  assert.equal(sweep.match(/requests: \{ none: \{ status: "PENDING", leaseExpiresAt: \{ gt: now \} \} \}/g)?.length, 2);
  assert.doesNotMatch(sweep, /none: \{ status: "PENDING" \} \}/);
});
