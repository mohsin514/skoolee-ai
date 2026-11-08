import assert from "node:assert/strict";
import { test } from "node:test";
import { attentionCount, publicFailureReason, publicJobResult, jobOperationSchema, reconcileCounts, retryBlockReason } from "../../src/lib/jobs/contract";

const failed = { state: "failed", uncertain: false, reason: "PROVIDER_UNAVAILABLE", workflow_id: "workflow", communication_id: null };
test("replay accepts only known failure work and never repairs invalid or uncertain input", () => {
  assert.equal(retryBlockReason(failed, false), null);
  for (const reason of ["INVALID_FILE", "UNSUPPORTED_VERSION", "UNKNOWN_EVENT_KIND"]) assert.equal(retryBlockReason({ ...failed, reason }, false), "SOURCE_CORRECTION_REQUIRED");
  assert.equal(retryBlockReason({ ...failed, uncertain: true }, false), "OUTCOME_UNCERTAIN");
  assert.equal(retryBlockReason({ ...failed, state: "completed" }, false), "NOT_FAILED");
  assert.equal(retryBlockReason(failed, true), "JOB_CANCELLED");
  assert.equal(retryBlockReason({ ...failed, workflow_id: null }, false), "WORKFLOW_UNAVAILABLE");
});
test("mutation intent uses bounded unique selections and action-specific structured reasons", () => {
  assert.ok(jobOperationSchema.safeParse({ action: "retry", items: ["item"], reason: "AUTHORIZATION_RESTORED" }).success);
  assert.ok(jobOperationSchema.safeParse({ action: "cancel", items: [], reason: "INCIDENT_CONTAINMENT" }).success);
  for (const input of [
    { action: "retry", items: [], reason: "AUTHORIZATION_RESTORED" },
    { action: "retry", items: ["item", "item"], reason: "AUTHORIZATION_RESTORED" },
    { action: "retry", items: ["item"], reason: "NO_LONGER_REQUIRED" },
    { action: "retry", items: ["item"] },
    { action: "cancel", items: ["item"], reason: "NO_LONGER_REQUIRED" },
    { action: "cancel", items: [], reason: "NO_LONGER_REQUIRED", schoolId: "forged" },
    { action: "retry", items: Array.from({length: 501}, (_, index) => `item-${index}`), reason: "AUTHORIZATION_RESTORED" },
  ]) assert.equal(jobOperationSchema.safeParse(input).success, false);
});
test("attention counts delivery evidence separately without rewriting processing outcomes", () => {
  const items = [
    { state: "completed", uncertain: false, delivery_failed_at: new Date() },
    { state: "failed", uncertain: true, delivery_failed_at: new Date() },
    { state: "completed", uncertain: false, delivery_failed_at: null },
    { state: "cancelled", uncertain: true, delivery_failed_at: null },
    { state: "queued", uncertain: false, delivery_failed_at: null },
  ];
  assert.equal(attentionCount(items), 3);
  assert.deepEqual(reconcileCounts(items), { total: 5, queued: 1, running: 0, completed: 2, failed: 1, cancelled: 1 });
  assert.throws(() => reconcileCounts([{state:"delivered"}]), /Unknown job outcome/);
});

test("job result DTO excludes raw import rows, private URLs and arbitrary diagnostic text", () => {
  const item = { state: "completed", reference_id: "report", version_id: "approved", result: { bytes: 120, url: "https://private-storage.invalid/capability", totalTransactions: 4, matched: 3, unmatched: 1, preview: [{ studentName: "Private pupil" }], internalError: "token" } };
  assert.deepEqual(publicJobResult("IMPORT", item), { totalTransactions: 4, matched: 3, unmatched: 1 });
  assert.deepEqual(publicJobResult("PDF", item), { bytes: 120, url: "/api/reports/download?reportCardId=report&versionId=approved" });
  assert.equal(publicJobResult("REPORT_DELIVERY", item), null);
  assert.equal(publicFailureReason("provider dumped a private token"), "WORKER_FAILURE");
  assert.equal(publicFailureReason("PROVIDER_UNAVAILABLE"), "PROVIDER_UNAVAILABLE");
});
