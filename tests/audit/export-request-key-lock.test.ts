import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1587: an export request key is claimed under a lock before the replay lookup and receipt write.
test("exportAuditHistory runs in a transaction and locks the request key before reading a receipt", () => {
  const src = readFileSync("src/lib/audit-history.ts", "utf8");
  const body = src.slice(src.indexOf("export async function exportAuditHistory"));
  const tx = body.indexOf("if (db === prisma) return tenantTransaction(tx => exportAuditHistory(user, raw, assertExport, tx, now)");
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`audit-export:${user.schoolId}:${user.userId}:${input.requestKey}`}))");
  const lookup = body.indexOf("db.auditLog.findFirst");
  const write = body.indexOf("db.auditLog.create");
  assert.ok(tx > 0, "default client path opens a tenant transaction");
  assert.ok(lock > tx && lock < lookup && lookup < write, "lock, then replay lookup, then receipt write");
});
