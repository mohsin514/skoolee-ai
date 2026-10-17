import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "../../src/lib/auth";
import type { PermissionFlags } from "../../src/lib/permissions";
import {
  EXAM_DOMAIN_WORKSPACE_KINDS,
  SchoolAiError,
  allowedWorkspaceKinds,
  approvalSeparation,
  assertApprovalRole,
  assertApprovalSeparation,
  assertWorkspaceDomainPermission,
  canAccessWorkspaceRecord,
  type WorkspaceAccessRecord,
  type WorkspacePermissionSnapshot,
} from "../../src/lib/school-ai/access";
import { PLATFORM_DEFAULT_DELIVERY_POLICY, resolveDeliveryPolicy, type DeliveryPolicy } from "../../src/lib/school-ai/delivery-policy";
import { parseWorkspaceData, workspaceDataSchema, workspaceKindSchema } from "../../src/lib/school-ai/schemas";
import { WORKSPACE_KINDS, type WorkspaceKind } from "../../src/lib/school-ai/types";
import { workspaceApprovalIssues } from "../../src/lib/school-ai/workflows";
import { FIXED_EPOCH_MS } from "./exam-studio-generators";

// SKO-408 task 4.2. The three new record kinds — DELIVERY_POLICY, BRIEF and PRACTICE — are a
// code-only change: `SchoolAiRecord.kind` is a plain `String` column, so each inherits versioning,
// `APPROVED` status, immutable revisions, campus scoping, compare-and-set on version and audit
// logging with no migration (R25.1-R25.4, R25.9). This file is pure: registration, role gating,
// permission routing and the R2.4 separation decision. The storage and approval path itself is a
// database test (`exam-studio-policy.database.test.ts`).

const NEW_KINDS = ["DELIVERY_POLICY", "BRIEF", "PRACTICE"] as const;
const NOW = new Date(FIXED_EPOCH_MS); // 2026-05-01T08:00:00Z
const TODAY = "2026-05-01";

const actor = (role: AuthUser["role"], userId = "actor-a"): AuthUser =>
  ({ role, userId, email: `${userId}@example.invalid`, schoolId: "school-a", campusId: "campus-a" });

const open: PermissionFlags = { canView: true, canAdd: true, canEdit: true, canDelete: true };
const grants = (overrides: Record<string, Partial<PermissionFlags>> = {}): WorkspacePermissionSnapshot =>
  new Map(["ai", "exams"].map((module) => [module, { ...open, ...(overrides[module] ?? {}) }]));

/** A storable policy body. The platform default is already parsed and frozen, so it is the base. */
const policyData = (overrides: Partial<DeliveryPolicy> = {}): Record<string, unknown> =>
  ({ ...PLATFORM_DEFAULT_DELIVERY_POLICY, ...overrides });

const schoolPolicy = (separationOfDuties: DeliveryPolicy["separationOfDuties"]) =>
  resolveDeliveryPolicy({ recordId: "policy-a", version: 3, data: policyData({ separationOfDuties }) });
const platformDefault = resolveDeliveryPolicy(null);

const record = (overrides: Partial<WorkspaceAccessRecord> = {}): WorkspaceAccessRecord =>
  ({ id: "record-a", schoolId: "school-a", campusId: "campus-a", kind: "PAPER", status: "DRAFT", createdById: "actor-a", subjectId: "math", classId: "grade-8", ...overrides });

const subjects = [{ id: "math", classId: "grade-8", campusId: "campus-a" }];

test("all three kinds are registered once in the kind list, the enum and the data union together", () => {
  for (const kind of NEW_KINDS) {
    assert.ok((WORKSPACE_KINDS as readonly string[]).includes(kind), `${kind} missing from WORKSPACE_KINDS`);
    assert.equal(workspaceKindSchema.safeParse(kind).success, true, `${kind} missing from workspaceKindSchema`);
  }
  // One union member per kind and no extra: a kind cannot be gated by role without a body schema,
  // and a body schema cannot exist for a kind the enum does not know.
  const discriminators = workspaceDataSchema.options.map((option) => option.shape.kind.value);
  assert.deepEqual(discriminators, [...WORKSPACE_KINDS]);
  assert.equal(new Set(discriminators).size, WORKSPACE_KINDS.length);
});

test("no kind escapes the migration-free contract: three kinds added, nothing renamed", () => {
  // The six pre-existing kinds keep their stored spelling, so every stored row still parses.
  assert.deepEqual([...WORKSPACE_KINDS], ["ONBOARDING", "SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "POLICY", "DELIVERY_POLICY", "BRIEF", "PRACTICE"]);
});

test("delivery policy is manager-only, while a brief and a practice set travel with the paper", () => {
  for (const role of ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"] as const) {
    for (const kind of NEW_KINDS) assert.ok(allowedWorkspaceKinds(actor(role)).includes(kind), `${role} / ${kind}`);
  }
  const teacher = allowedWorkspaceKinds(actor("TEACHER"));
  assert.ok(teacher.includes("BRIEF"));
  assert.ok(teacher.includes("PRACTICE"));
  assert.equal(teacher.includes("DELIVERY_POLICY"), false, "a teacher never reaches the record carrying separationOfDuties and maxForms");
  // Other staff keep the narrow pair, and families and platform operators keep nothing.
  for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) {
    assert.deepEqual(allowedWorkspaceKinds(actor(role)), ["SOURCE", "WORKFLOW"]);
  }
  for (const role of ["PARENT", "STUDENT", "APP_OWNER"] as const) assert.deepEqual(allowedWorkspaceKinds(actor(role)), []);
});

test("a kind outside a role is refused after the record loads, not only in the listing filter", () => {
  const teacher = actor("TEACHER");
  // Even as its own creator, a teacher cannot read a delivery policy: the kind is absent from the role.
  assert.equal(canAccessWorkspaceRecord(teacher, record({ kind: "DELIVERY_POLICY", campusId: "campus-a", createdById: teacher.userId }), "read", subjects), false);
  assert.equal(canAccessWorkspaceRecord(actor("PRINCIPAL"), record({ kind: "DELIVERY_POLICY", subjectId: null, classId: null }), "write", subjects), true);
  for (const kind of ["BRIEF", "PRACTICE"] as const) {
    assert.equal(canAccessWorkspaceRecord(teacher, record({ kind, createdById: teacher.userId }), "write", subjects), true, kind);
    // An approved brief or practice set authored by someone else is not shared reading, unlike an
    // approved SOURCE or CURRICULUM. Absence from that list is the refusal.
    assert.equal(canAccessWorkspaceRecord(teacher, record({ kind, status: "APPROVED", createdById: "other-teacher" }), "read", subjects), false, kind);
  }
});

test("every new kind routes its domain authority through the exams permission module", async () => {
  assert.deepEqual([...EXAM_DOMAIN_WORKSPACE_KINDS], ["CURRICULUM", "PAPER", "DELIVERY_POLICY", "BRIEF", "PRACTICE"]);
  const manager = actor("PRINCIPAL");
  for (const kind of NEW_KINDS) {
    await assertWorkspaceDomainPermission(manager, kind, {}, "add", grants());
    // A revoked exams grant removes the kind within the same request, exactly as for CURRICULUM.
    await assert.rejects(
      () => assertWorkspaceDomainPermission(manager, kind, {}, "add", grants({ exams: { canAdd: false } })),
      (error: unknown) => error instanceof SchoolAiError && error.status === 403 && error.code === "PERMISSION_DENIED",
      kind,
    );
  }
  await assert.rejects(() => assertWorkspaceDomainPermission(actor("TEACHER"), "DELIVERY_POLICY", {}, "add", grants()), { status: 403 });
});

test("the delivery policy body is the schema that owns it, and the placeholder body stays narrow", () => {
  const parsed = parseWorkspaceData("DELIVERY_POLICY", policyData({ separationOfDuties: "REQUIRED", maxForms: 2 }));
  assert.equal(parsed.separationOfDuties, "REQUIRED");
  assert.equal(parsed.maxForms, 2);
  // `maxForms` configures down from the platform ceiling, never up, and the record is strict.
  assert.throws(() => parseWorkspaceData("DELIVERY_POLICY", policyData({ maxForms: 5 })));
  assert.throws(() => parseWorkspaceData("DELIVERY_POLICY", { ...policyData(), browserExamKey: "secret" }));
  // PRACTICE has its real body now (`practiceSetSchema`, SKO-408 R18.4): a bare teaching scope is no
  // longer a practice set, and an item that names an exam outside the set is refused.
  const item = { sourceAssignmentId: "exam-1", questionId: "q1", prompt: "What is 2 + 2?", type: "SINGLE_CHOICE", options: [{ id: "a1", text: "4" }], marks: 2, outcomeIds: ["outcome-1"] };
  assert.equal((parseWorkspaceData("PRACTICE", { subjectId: "math", classId: "grade-8", outcomeIds: ["outcome-1"], sourceAssignmentIds: ["exam-1"], items: [item] }) as { items: unknown[] }).items.length, 1);
  assert.throws(() => parseWorkspaceData("PRACTICE", { subjectId: "math", classId: "grade-8" }), Error, "a scope alone is not a practice set");
  assert.throws(() => parseWorkspaceData("PRACTICE", { subjectId: "math", classId: "grade-8", outcomeIds: ["outcome-1"], sourceAssignmentIds: ["exam-2"], items: [item] }), Error, "items come from the set's released exams");
  assert.throws(() => parseWorkspaceData("PRACTICE", { subjectId: "math", classId: "grade-8", outcomeIds: ["outcome-1"], sourceAssignmentIds: ["exam-1"], items: [{ ...item, correctOptionId: "a1" }] }), Error, "no key travels in practice");
  assert.throws(() => parseWorkspaceData("BRIEF", { subjectId: "math", classId: "grade-8" }), Error, "a brief body is the brief, not a scope on its own");
});

test("assertApprovalRole keeps its signature and its answer to R2.3", () => {
  assert.equal(assertApprovalRole.length, 1);
  for (const role of ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"] as const) assert.doesNotThrow(() => assertApprovalRole(actor(role)));
  for (const role of ["TEACHER", "ACCOUNTANT", "STUDENT"] as const) assert.throws(() => assertApprovalRole(actor(role)), { status: 403 });
});

test("an unconfigured school degrades to always-allow, and the decision says which policy applied", () => {
  const approver = actor("PRINCIPAL", "manager-a");
  const authored = { createdById: "manager-a", updatedById: "manager-a" };
  const byDefault = approvalSeparation(approver, authored, platformDefault);
  assert.deepEqual(byDefault, { allowed: true, reason: "SEPARATION_NOT_REQUIRED", separationOfDuties: "NOT_REQUIRED", source: "PLATFORM_DEFAULT" });
  const notRequired = assertApprovalSeparation(approver, authored, schoolPolicy("NOT_REQUIRED"));
  assert.deepEqual(notRequired, { allowed: true, reason: "SEPARATION_NOT_REQUIRED", separationOfDuties: "NOT_REQUIRED", source: "SCHOOL_POLICY" });
  // A stored policy that no longer parses degrades the same way: the default removes authority.
  const unreadable = resolveDeliveryPolicy({ recordId: "policy-a", version: 3, data: { separationOfDuties: "REQUIRED" } });
  assert.equal(unreadable.source, "PLATFORM_DEFAULT");
  assert.equal(unreadable.defaultedBecause, "POLICY_UNREADABLE");
  assert.equal(approvalSeparation(approver, authored, unreadable).allowed, true);
});

test("a required separation refuses the approver who authored the version, and names no record content", () => {
  const required = schoolPolicy("REQUIRED");
  const approver = actor("PRINCIPAL", "manager-a");
  assert.deepEqual(approvalSeparation(approver, { createdById: "teacher-a", updatedById: "teacher-b" }, required), { allowed: true, reason: "DISTINCT_ACTORS", separationOfDuties: "REQUIRED", source: "SCHOOL_POLICY" });
  // Either authoring actor decides. Checking the creator as well as the last writer is stricter
  // than the letter of R2.4, so an approver cannot hand the record over for one save and take it back.
  for (const authored of [{ createdById: "teacher-a", updatedById: "manager-a" }, { createdById: "manager-a", updatedById: "teacher-a" }]) {
    const decision = approvalSeparation(approver, authored, required);
    assert.deepEqual(decision, { allowed: false, reason: "SAME_ACTOR", separationOfDuties: "REQUIRED", source: "SCHOOL_POLICY" });
    assert.throws(
      () => assertApprovalSeparation(approver, authored, required),
      (error: unknown) => {
        assert.ok(error instanceof SchoolAiError && error.status === 403 && error.code === "APPROVAL_SEPARATION_REQUIRED");
        assert.ok(error.message.includes("school's approved delivery policy"), "the refusal states the policy source that applied");
        assert.equal(error.message.includes("policy-a"), false, "the refusal carries no record identifier");
        return true;
      },
    );
  }
  // A refusal is never attributable to the platform default, because the default is NOT_REQUIRED.
  assert.equal(approvalSeparation(approver, { createdById: "manager-a", updatedById: "manager-a" }, platformDefault).allowed, true);
});

test("an expired delivery policy cannot be approved, because it could govern no attempt", () => {
  assert.deepEqual(workspaceApprovalIssues("DELIVERY_POLICY", policyData({ expiresOn: null }), NOW), []);
  assert.deepEqual(workspaceApprovalIssues("DELIVERY_POLICY", policyData({ expiresOn: TODAY }), NOW), []);
  const issues = workspaceApprovalIssues("DELIVERY_POLICY", policyData({ expiresOn: "2026-04-30" }), NOW);
  assert.equal(issues.length, 1);
  assert.ok(issues[0].includes("2026-04-30"));
  // An unusable clock cannot establish that the policy is in date, so it refuses rather than approves.
  assert.equal(workspaceApprovalIssues("DELIVERY_POLICY", policyData({ expiresOn: "2026-04-30" }), new Date(Number.NaN)).length, 1);
  // Practice readiness lands with its schema and does not block approval today. Brief readiness has
  // since landed as `briefApprovalIssues` (SKO-408 task 5.1) and is covered by
  // `exam-studio-brief.test.ts`; like every other typed kind, it reads a parsed body.
  assert.deepEqual(workspaceApprovalIssues("PRACTICE", {}, NOW), []);
  // The injected clock is additive: the existing two-argument call still works for every kind.
  for (const kind of WORKSPACE_KINDS as readonly WorkspaceKind[]) {
    if (kind === "DELIVERY_POLICY") assert.deepEqual(workspaceApprovalIssues(kind, policyData()), []);
  }
});
