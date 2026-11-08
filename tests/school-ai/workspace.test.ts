import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import { allowedWorkspaceKinds, assertApprovalRole, assertSchoolAiAccess, canAccessWorkspaceRecord, readSchoolAiJson, SchoolAiError } from "../../src/lib/school-ai/access";
import { createWorkspaceSchema, onboardingDataSchema, parseWorkspaceData, sourceDataSchema, updateWorkspaceSchema, workflowDataSchema } from "../../src/lib/school-ai/schemas";
import { nextWorkspaceStatus, protectSourceMetadata, workspaceApprovalIssues } from "../../src/lib/school-ai/workflows";

const user = (role: AuthUser["role"], id = "staff-a", campusId: string | null = "campus-a"): AuthUser => ({ role, userId: id, email: `${id}@example.invalid`, schoolId: "school-a", campusId });
const record = { id: "record-a", schoolId: "school-a", campusId: "campus-a", kind: "SOURCE", status: "DRAFT", createdById: "staff-a", subjectId: "math", classId: "grade-8" };
const subjects = [{ id: "math", classId: "grade-8", campusId: "campus-a" }];

test("staff boundary excludes families and platform operators even when they own a guessed record", () => {
  for (const role of ["PARENT", "STUDENT", "APP_OWNER"] as const) {
    assert.deepEqual(allowedWorkspaceKinds(user(role)), []);
    assert.equal(canAccessWorkspaceRecord(user(role), record, "read", subjects), false);
  }
});

test("campus and tenant boundaries apply even to owned records", () => {
  assert.equal(canAccessWorkspaceRecord(user("ADMIN"), { ...record, schoolId: "school-b" }, "read"), false);
  assert.equal(canAccessWorkspaceRecord(user("ADMIN"), { ...record, campusId: "campus-b" }, "write"), false);
  assert.equal(canAccessWorkspaceRecord(user("ADMIN"), { ...record, campusId: null }, "read"), false);
  assert.equal(canAccessWorkspaceRecord(user("SUPER_ADMIN", "group", null), { ...record, campusId: null }, "read"), true);
});

test("teachers need current subject assignment, own drafts, and cannot inspect another teacher's paper", () => {
  const teacher = user("TEACHER");
  assert.equal(canAccessWorkspaceRecord(teacher, record, "read", []), false);
  assert.equal(canAccessWorkspaceRecord(teacher, record, "write", subjects), true);
  assert.equal(canAccessWorkspaceRecord(teacher, { ...record, createdById: "another" }, "read", subjects), false);
  assert.equal(canAccessWorkspaceRecord(teacher, { ...record, createdById: "another", status: "APPROVED" }, "read", subjects), true);
  assert.equal(canAccessWorkspaceRecord(teacher, { ...record, createdById: "another", status: "APPROVED" }, "write", subjects), false);
  assert.equal(canAccessWorkspaceRecord(teacher, { ...record, createdById: "another", status: "APPROVED", kind: "PAPER" }, "read", subjects), false);
  assert.equal(canAccessWorkspaceRecord(teacher, { ...record, kind: "POLICY" }, "read", subjects), false);
});

test("non-academic staff only access their own source and workflow drafts", () => {
  const accountant = user("ACCOUNTANT");
  assert.equal(canAccessWorkspaceRecord(accountant, record, "read"), true);
  assert.equal(canAccessWorkspaceRecord(accountant, { ...record, createdById: "other", status: "APPROVED" }, "read"), false);
  assert.equal(canAccessWorkspaceRecord(accountant, { ...record, kind: "CURRICULUM" }, "read"), false);
  assert.throws(() => assertApprovalRole(accountant), SchoolAiError);
  assert.throws(() => assertApprovalRole(user("TEACHER")), SchoolAiError);
});

test("permission snapshots retain denied custom permissions", async () => {
  const denied = new Map([["ai", { canView: false, canAdd: false, canEdit: false, canDelete: false }]]);
  await assert.rejects(() => assertSchoolAiAccess(user("TEACHER"), "view", denied), { status: 403 });
  await assert.doesNotReject(() => assertSchoolAiAccess(user("SUPER_ADMIN"), "view", denied));
});

test("stale approval, hidden approval edits, and archived mutation are rejected", () => {
  assert.throws(() => nextWorkspaceStatus({ version: 3, status: "DRAFT" }, { version: 2, action: "approve" }), { status: 409 });
  assert.throws(() => nextWorkspaceStatus({ version: 3, status: "DRAFT" }, { version: 3, action: "approve", title: "unreviewed" }), { status: 400 });
  assert.throws(() => nextWorkspaceStatus({ version: 3, status: "ARCHIVED" }, { version: 3, title: "revive" }), { status: 409 });
  assert.equal(nextWorkspaceStatus({ version: 3, status: "APPROVED" }, { version: 3, title: "Changed" }), "DRAFT");
  assert.equal(nextWorkspaceStatus({ version: 3, status: "DRAFT" }, { version: 3, action: "review" }), "IN_REVIEW");
  assert.equal(nextWorkspaceStatus({ version: 3, status: "IN_REVIEW" }, { version: 3, action: "approve" }), "APPROVED");
});

test("source storage keys and extraction provenance cannot be spoofed or replaced", () => {
  assert.throws(() => protectSourceMetadata({ storageKey: "another-school/private.pdf" }), { status: 400 });
  const trusted = protectSourceMetadata({ extractedText: "original" }, undefined, { storageKey: "school-a/original", sha256: "a".repeat(64) });
  assert.equal(protectSourceMetadata({ extractedText: "corrected" }, trusted).storageKey, trusted.storageKey);
  assert.throws(() => protectSourceMetadata({ ...trusted, sha256: "b".repeat(64) }, trusted), { status: 400 });
});

test("strict kind validation refuses fabricated execution, unknown facts and oversized evidence", () => {
  assert.equal(workflowDataSchema.safeParse({ goal: "Send announcement", steps: [{ id: "send", title: "Delivered", status: "complete" }], sourceIds: [], missingInformation: [] }).success, false);
  assert.equal(onboardingDataSchema.safeParse({ path: "new", answers: { approvedBankBalance: "999" }, confirmedKeys: [], step: "profile" }).success, false);
  assert.equal(onboardingDataSchema.safeParse({ path: "new", answers: {}, confirmedKeys: ["schoolName"], step: "profile" }).success, false);
  assert.equal(sourceDataSchema.safeParse({ extractedText: "x".repeat(80001), documentKind: "other", fileName: "source", mimeType: "text/plain" }).success, false);
  assert.throws(() => parseWorkspaceData("POLICY", { mode: "automatic", instructions: "Run all actions", scope: "school", requiresApproval: false }));
  assert.equal(createWorkspaceSchema.safeParse({ kind: "POLICY", title: "Rules", data: {}, idempotencyKey: "unique-key", schoolId: "spoof" }).success, false);
});

test("review actions are bound to a saved version, and missing extraction facts block approval", () => {
  assert.equal(updateWorkspaceSchema.safeParse({ version: 1, action: "review", data: {} }).success, false);
  assert.equal(updateWorkspaceSchema.safeParse({ version: 1, action: "save" }).success, false);
  assert(workspaceApprovalIssues("SOURCE", { documentKind: "other", extractedText: "", fileName: "", mimeType: "text/plain" }).length > 0);
  assert(workspaceApprovalIssues("SOURCE", { documentKind: "other", extractedText: "Readable", fileName: "", mimeType: "text/plain", uncertainties: ["Missing page"] }).length > 0);
  assert(workspaceApprovalIssues("WORKFLOW", { goal: "Run fees", steps: [{ id: "send", title: "Configure sender", status: "blocked", module: "fees" }], sourceIds: [], missingInformation: [] }).length > 0);
});

test("body limit is enforced while streaming without trusting the Content-Length header", async () => {
  const valid = new Request("http://example.invalid/api", { method: "POST", body: JSON.stringify({ version: 1 }) });
  assert.deepEqual(await readSchoolAiJson(valid, 32), { version: 1 });
  const oversized = new Request("http://example.invalid/api", { method: "POST", body: "x".repeat(65), headers: { "Content-Length": "1" } });
  await assert.rejects(() => readSchoolAiJson(oversized, 64), { status: 413 });
  await assert.rejects(() => readSchoolAiJson(new Request("http://example.invalid/api", { method: "POST", body: "not json" })), { status: 400 });
});
