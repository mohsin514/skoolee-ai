import assert from "node:assert/strict";
import { test } from "node:test";
import { workflowOperationSchema, workflowCancelReasons, workflowRetryReasons } from "../../src/lib/queue/operation-contract";

const reference = { schoolId: "synthetic-school", eventId: "ee847016-faa8-4545-8079-32b6d82a6049" };
test("operator actions require an explicit compatible privacy-safe reason", () => {
  for (const reason of workflowRetryReasons) assert.ok(workflowOperationSchema.safeParse({ ...reference, action: "retry", reason }).success);
  for (const reason of workflowCancelReasons) assert.ok(workflowOperationSchema.safeParse({ ...reference, action: "cancel", reason }).success);
  for (const input of [
    { ...reference, action: "retry" },
    { ...reference, action: "retry", reason: "NO_LONGER_REQUIRED" },
    { ...reference, action: "cancel", reason: "AUTHORIZATION_RESTORED" },
    { ...reference, action: "retry", reason: "Pupil private content is not a reason code" },
    { ...reference, action: "retry", reason: "CONFIGURATION_CORRECTED", notes: "Unbounded private payload" },
  ]) assert.equal(workflowOperationSchema.safeParse(input).success, false);
});
