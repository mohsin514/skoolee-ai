import { test } from "node:test";
import assert from "node:assert/strict";
import { STEP_STATUSES, nextStepAction, deriveJobStatus, deriveOutcome, type StepStatus } from "../../src/lib/ai-workflows/executor/scheduler";

const step = (over: Partial<Parameters<typeof nextStepAction>[0]> = {}) => ({ status: "PENDING" as StepStatus, effectiveClass: "A" as const, dependsOn: [], missingFields: [], confirmed: false, ...over });

test("class decides the next move: A runs, B waits for a confirmation, C hands off", () => {
  assert.equal(nextStepAction(step(), new Map()), "run");
  assert.equal(nextStepAction(step({ effectiveClass: "B" }), new Map()), "await-confirm");
  assert.equal(nextStepAction(step({ effectiveClass: "B", confirmed: true }), new Map()), "run");
  assert.equal(nextStepAction(step({ effectiveClass: "C" }), new Map()), "handoff");
  assert.equal(nextStepAction(step({ missingFields: ["/date"] }), new Map()), "ask");
});

test("dependencies gate and dead prerequisites skip", () => {
  assert.equal(nextStepAction(step({ dependsOn: ["a"] }), new Map([["a", "RUNNING" as StepStatus]])), "wait");
  assert.equal(nextStepAction(step({ dependsOn: ["a"] }), new Map([["a", "HANDED_OFF_DONE" as StepStatus]])), "run");
  for (const dead of ["FAILED", "UNCERTAIN", "STALE", "BLOCKED", "SKIPPED"] as StepStatus[]) assert.equal(nextStepAction(step({ dependsOn: ["a"] }), new Map([["a", dead]])), "skip", dead);
  assert.equal(nextStepAction(step({ dependsOn: ["missing"] }), new Map()), "skip");
});

test("every status has a defined next move (exhaustive)", () => {
  for (const status of STEP_STATUSES) for (const effectiveClass of ["A", "B", "C"] as const) {
    assert.ok(["wait", "skip", "ask", "run", "await-confirm", "handoff", "none"].includes(nextStepAction(step({ status, effectiveClass }), new Map())));
  }
});

test("outcomes are honest: reads answer, drafts are plans, hand-offs await approval, mixed results are partial", () => {
  assert.equal(deriveOutcome([{ status: "SUCCEEDED", kind: "read" }]), "ANSWERED");
  assert.equal(deriveOutcome([{ status: "SUCCEEDED", kind: "draft" }]), "PLAN_SAVED");
  assert.equal(deriveOutcome([{ status: "WAITING_HANDOFF", kind: "handoff" }]), "AWAITING_APPROVAL");
  assert.equal(deriveOutcome([{ status: "SUCCEEDED", kind: "write" }]), "EXECUTED");
  assert.equal(deriveOutcome([{ status: "SUCCEEDED", kind: "write" }, { status: "FAILED", kind: null }]), "PARTIAL");
  assert.equal(deriveOutcome([{ status: "SUCCEEDED", kind: "write" }, { status: "WAITING_HANDOFF", kind: "handoff" }]), "PARTIAL");
  assert.equal(deriveOutcome([{ status: "FAILED", kind: null }]), "NOTHING_DONE");
  assert.equal(deriveOutcome([{ status: "UNCERTAIN", kind: null }]), "NOTHING_DONE", "an unverified write is never reported as done");
});

test("job status follows the most urgent step", () => {
  assert.equal(deriveJobStatus([{ status: "SUCCEEDED", kind: "write" }, { status: "NEEDS_INPUT", kind: null }]), "NEEDS_INPUT");
  assert.equal(deriveJobStatus([{ status: "WAITING_CONFIRM", kind: null }, { status: "PENDING", kind: null }]), "WAITING_CONFIRM");
  assert.equal(deriveJobStatus([{ status: "WAITING_HANDOFF", kind: "handoff" }]), "WAITING_HANDOFF");
  assert.equal(deriveJobStatus([{ status: "SUCCEEDED", kind: "write" }, { status: "FAILED", kind: null }]), "COMPLETED");
});
