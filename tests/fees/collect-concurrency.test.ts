import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1443: a manual collection posts in one transaction, and same-key retries queue on one advisory lock.
const source = readFileSync("src/lib/fees/collect-command.ts", "utf8");
const core = source.slice(source.indexOf("export async function collectPaymentCore"));

test("SKAI-1443: the replay check, hand-off binding and payment write share one transaction on the same client", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"), core.indexOf("{ timeout: 20000 }"));
  assert.match(tx, /pg_advisory_xact_lock\(hashtext\(/);
  assert.match(tx, /const winner = await replay\(tx\);/);
  assert.match(tx, /await bindHandoff\(tx, user,/);
  assert.match(tx, /await recordPayment\(tx, \{/);
  assert.match(tx, /await tx\.auditLog\.create/);
});

test("SKAI-1443: no outer-client query runs while the transaction holds its connection", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"), core.indexOf("{ timeout: 20000 }"));
  assert.doesNotMatch(tx.replace("prisma.$transaction(", ""), /\bprisma\./);
});

test("SKAI-1443: the advisory lock is taken before the replay check", () => {
  const tx = core.slice(core.indexOf("prisma.$transaction(async (tx) => {"));
  assert.ok(tx.indexOf("pg_advisory_xact_lock") < tx.indexOf("replay(tx)"));
});
