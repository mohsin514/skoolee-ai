import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditAction, minimizedAuditChanges } from "../../src/lib/audit-history";

// SKAI-1592: consent decisions keep their domain action and consent state in activity history.
test("a named domain action wins over the old/new shape", () => {
  assert.equal(auditAction(null, { action: "GRANT", consent: "GRANTED" }), "GRANT");
  assert.equal(auditAction(null, { action: "REVOKE", consent: "REVOKED" }), "REVOKE");
});

test("rows without a safe action keep CREATE/UPDATE/DELETE", () => {
  assert.equal(auditAction(null, { status: "ACTIVE" }), "CREATE");
  assert.equal(auditAction({ status: "ACTIVE" }, { status: "ARCHIVED" }), "UPDATE");
  assert.equal(auditAction({ status: "ACTIVE" }, null), "DELETE");
  assert.equal(auditAction(null, { action: "free text <script>" }), "CREATE", "unsafe action text is never surfaced");
});

test("the consent state is a safe change; unknown values are dropped", () => {
  assert.deepEqual(minimizedAuditChanges(null, { action: "GRANT", consent: "GRANTED" }), [{ field: "consent", before: null, after: "GRANTED" }]);
  assert.deepEqual(minimizedAuditChanges(null, { consent: "maybe" }), []);
});

test("the history panel labels consent actions and the consent field", () => {
  const panel = readFileSync("src/components/audit/audit-history-panel.tsx", "utf8");
  assert.match(panel, /GRANT: "Consent given", REVOKE: "Consent withdrawn"/);
  assert.match(panel, /consent: "Consent" \}/);
});
