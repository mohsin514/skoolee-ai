import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1589: a batch reversal claims the COMMITTED/PARTIAL state first, so a competing request gets 409, not a second success.
const src = readFileSync("src/app/api/import-batches/[batchId]/route.ts", "utf8");
const CLAIM = 'state: { in: ["COMMITTED", "PARTIAL"] } }, data: { state: "REVERSED", reversedAt } });';

test("both reversal paths claim the batch before any other write", () => {
  const claims = src.split(CLAIM).length - 1;
  assert.equal(claims, 2, "roster and bank-statement paths both claim");
  for (const write of ["tx.bankReconciliation.updateMany", "tx.student.deleteMany"]) {
    const w = src.indexOf(write);
    const c = src.lastIndexOf(CLAIM, w);
    assert.ok(c > 0 && c < w && src.slice(c, w).includes('if (!claimed.count) throw new ApiError("This batch was already reversed", 409);'), write);
  }
});

test("a roster reversal that deletes fewer pupils than expected rolls back", () => {
  assert.match(src, /const deleted = await tx\.student\.deleteMany\([^;]+;\n\s*if \(deleted\.count !== studentIds\.length\) throw new ApiError\(/);
});

// SKAI-2125: reversing an unposted bank statement releases its transaction keys inside the same transaction, so a corrected statement can import them again.
test("bank statement reversal releases unposted transaction keys in the reversal transaction", () => {
  const release = "await tx.bankTransactionKey.deleteMany({ where: { reconciliationId: reconciliation.id, schoolId: user.schoolId, campusId: batch.campusId, paymentId: null } });";
  const r = src.indexOf(release);
  assert.ok(r > 0, "keys are deleted");
  const recon = src.lastIndexOf("tx.bankReconciliation.updateMany", r);
  const audit = src.indexOf("tx.auditLog.create", r);
  assert.ok(recon > 0 && audit > r, "delete runs after the reconciliation is reversed, inside the same transaction");
});
