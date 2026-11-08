import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import type { PermissionFlags } from "../../src/lib/permissions";
import { SchoolAiError, type WorkspacePermissionSnapshot } from "../../src/lib/school-ai/access";
import {
  assertStudioAction, recordStudioAction, STUDIO_ACTIONS, STUDIO_AUTHORITY, STUDIO_ROLES,
  studioActionAuditEntry, studioActionDecision, studioAllows, studioRolesFor,
  type StudioAction, type StudioActionContext, type StudioRole,
} from "../../src/lib/school-ai/studio-access";

const actor = (role: AuthUser["role"], overrides: Partial<AuthUser> = {}): AuthUser =>
  ({ role, userId: "actor-a", email: "actor-a@example.invalid", schoolId: "school-a", campusId: "campus-a", ...overrides });

const open: PermissionFlags = { canView: true, canAdd: true, canEdit: true, canDelete: true };
const grants = (overrides: Record<string, Partial<PermissionFlags>> = {}): WorkspacePermissionSnapshot =>
  new Map(["ai", "exams"].map((module) => [module, { ...open, ...(overrides[module] ?? {}) }]));

/** Every scope satisfied, so a refusal can only come from absence in the matrix. */
const scope = (overrides: Partial<StudioActionContext> = {}): StudioActionContext => ({
  schoolId: "school-a", campusId: "campus-a", subjectId: "math", classId: "grade-8",
  isAssignedSubject: true, isAssignedInvigilator: true, isModerating: true, isOwnAttempt: true,
  isLinkedGuardian: true, attemptWindowOpen: true, resultReleased: true, hasSupportGrant: true,
  ...overrides,
});

/** One actor and context per studio role, so no second role can mask a refusal. */
const fixtures: Record<StudioRole, { user: AuthUser; context: StudioActionContext; also?: StudioRole }> = {
  AUTHOR: { user: actor("TEACHER"), context: scope({ isAssignedInvigilator: false, isModerating: false }) },
  // R15.9: a manager supervises any sitting, so the approver fixture holds the invigilator role too.
  ACADEMIC_APPROVER: { user: actor("PRINCIPAL"), context: scope({ isAssignedSubject: false, isModerating: false }), also: "INVIGILATOR" },
  INVIGILATOR: { user: actor("TEACHER"), context: scope({ isAssignedSubject: false, isModerating: false }) },
  MODERATOR: { user: actor("TEACHER"), context: scope({ isAssignedSubject: false, isAssignedInvigilator: false }) },
  CANDIDATE: { user: actor("STUDENT"), context: scope() },
  GUARDIAN: { user: actor("PARENT", { campusId: null }), context: scope() },
  PLATFORM_SUPPORT: { user: actor("APP_OWNER", { schoolId: "platform", campusId: null }), context: scope() },
};

const allowed = (role: StudioRole, action: StudioAction) =>
  studioActionDecision(fixtures[role].user, action, fixtures[role].context, grants()).allowed;

test("the matrix decides every studio role and action pair, and nothing else does", () => {
  for (const role of STUDIO_ROLES) {
    const held = studioRolesFor(fixtures[role].user, fixtures[role].context);
    assert.deepEqual([...held].sort(), [role, ...(fixtures[role].also ? [fixtures[role].also!] : [])].sort(), `${role} fixture holds the wrong roles`);
    for (const action of STUDIO_ACTIONS) {
      const expected = STUDIO_AUTHORITY[role].has(action) || Boolean(fixtures[role].also && STUDIO_AUTHORITY[fixtures[role].also!].has(action));
      assert.equal(allowed(role, action), expected, `${role} / ${action}`);
    }
  }
});

test("an author authors and rehearses, and never approves, admits, grants time, decides a signal or releases a result", () => {
  for (const action of ["AUTHOR_ITEM", "RUN_REHEARSAL", "READ_PROTECTED_KEY", "EXPORT_EVIDENCE_PACK"] as const) assert.equal(allowed("AUTHOR", action), true, action);
  for (const action of ["APPROVE_VERSION", "ADMIT_CLIENT", "GRANT_EXTRA_TIME", "DECIDE_SIGNAL", "RELEASE_RESULT"] as const) assert.equal(allowed("AUTHOR", action), false, action);
  const unassigned = scope({ isAssignedSubject: false, isAssignedInvigilator: false, isModerating: false });
  for (const action of ["AUTHOR_ITEM", "EXPORT_EVIDENCE_PACK"] as const) assert.equal(studioActionDecision(fixtures.AUTHOR.user, action, unassigned, grants()).allowed, false, action);
});

test("an academic approver approves versions, policies and remedies and releases results", () => {
  for (const action of ["APPROVE_VERSION", "APPROVE_POLICY", "AUTHORIZE_REMEDY", "RELEASE_RESULT"] as const) {
    assert.equal(studioActionDecision(fixtures.ACADEMIC_APPROVER.user, action, fixtures.ACADEMIC_APPROVER.context, grants()).role, "ACADEMIC_APPROVER", action);
  }
});

test("an invigilator never reaches a protected key, a response body or an unreleased result", () => {
  for (const action of ["READ_READINESS", "READ_ACTIVE_ATTEMPT", "READ_ACKNOWLEDGED_REVISION", "READ_SIGNAL", "READ_ADMISSION_REASON", "GRANT_EXTRA_TIME", "SUPERVISED_PAUSE", "REQUEST_LOCAL_RELEASE"] as const) {
    assert.equal(allowed("INVIGILATOR", action), true, action);
  }
  for (const action of ["READ_PROTECTED_KEY", "READ_RESPONSE_BODY", "READ_UNRELEASED_RESULT", "READ_CAPTURE"] as const) assert.equal(allowed("INVIGILATOR", action), false, action);
});

test("a moderator reads under moderation and never edits a released form, admits a client or deletes a signal", () => {
  for (const action of ["READ_RESPONSE_BODY", "READ_PROTECTED_KEY", "READ_SIGNAL", "RECORD_MODERATION", "READ_UNRELEASED_RESULT"] as const) assert.equal(allowed("MODERATOR", action), true, action);
  for (const action of ["EDIT_RELEASED_FORM", "ADMIT_CLIENT", "DELETE_SIGNAL"] as const) assert.equal(allowed("MODERATOR", action), false, action);
  const notModerating = scope({ isAssignedSubject: false, isAssignedInvigilator: false, isModerating: false });
  assert.equal(studioActionDecision(fixtures.MODERATOR.user, "READ_RESPONSE_BODY", notModerating, grants()).allowed, false);
});

test("a sealed released form and a recorded signal are beyond every role", () => {
  for (const role of STUDIO_ROLES) for (const action of ["EDIT_RELEASED_FORM", "DELETE_SIGNAL"] as const) assert.equal(STUDIO_AUTHORITY[role].has(action), false, `${role} / ${action}`);
});

test("a candidate reaches only its own attempt, and only once the window is open and the result released", () => {
  assert.equal(allowed("CANDIDATE", "READ_CANDIDATE_PROJECTION"), true);
  for (const action of ["READ_PROTECTED_KEY", "READ_SIGNAL", "READ_UNRELEASED_RESULT", "READ_CAPTURE"] as const) assert.equal(allowed("CANDIDATE", action), false, action);
  const closed = scope({ attemptWindowOpen: false }), unreleased = scope({ resultReleased: false }), otherAttempt = scope({ isOwnAttempt: false });
  assert.equal(studioActionDecision(fixtures.CANDIDATE.user, "READ_CANDIDATE_PROJECTION", closed, grants()).allowed, false);
  assert.equal(studioActionDecision(fixtures.CANDIDATE.user, "READ_OWN_RESULT", unreleased, grants()).allowed, false);
  assert.equal(studioActionDecision(fixtures.CANDIDATE.user, "READ_ATTEMPT_RECEIPT", unreleased, grants()).allowed, true);
  for (const action of ["READ_CANDIDATE_PROJECTION", "READ_RESPONSE_BODY", "READ_OWN_RESULT"] as const) assert.equal(studioActionDecision(fixtures.CANDIDATE.user, action, otherAttempt, grants()).allowed, false, action);
});

test("a guardian reaches released results and feedback for a linked child and nothing else", () => {
  for (const action of ["READ_LINKED_RELEASED_RESULT", "READ_LINKED_RELEASED_FEEDBACK"] as const) assert.equal(allowed("GUARDIAN", action), true, action);
  for (const action of ["READ_SIGNAL", "READ_CAPTURE", "READ_PROTECTED_KEY", "READ_UNRELEASED_RESULT"] as const) assert.equal(allowed("GUARDIAN", action), false, action);
  for (const context of [scope({ isLinkedGuardian: false }), scope({ resultReleased: false })]) {
    assert.equal(studioActionDecision(fixtures.GUARDIAN.user, "READ_LINKED_RELEASED_RESULT", context, grants()).allowed, false);
  }
});

test("platform support reads configuration under a live grant and never a key, a response body or a recording", () => {
  for (const action of ["READ_CONFIGURATION", "READ_DELIVERY_POLICY", "READ_ADMISSION_REASON", "READ_FAILURE_DIAGNOSTICS"] as const) assert.equal(allowed("PLATFORM_SUPPORT", action), true, action);
  for (const action of ["READ_PROTECTED_KEY", "READ_RESPONSE_BODY", "READ_CAPTURE", "READ_SIGNAL"] as const) assert.equal(allowed("PLATFORM_SUPPORT", action), false, action);
  assert.equal(studioActionDecision(fixtures.PLATFORM_SUPPORT.user, "READ_CONFIGURATION", scope({ hasSupportGrant: false }), grants()).allowed, false);
});

test("protected keys stay out of a response built for a role that cannot read them", () => {
  for (const role of ["INVIGILATOR", "CANDIDATE", "GUARDIAN", "PLATFORM_SUPPORT"] as const) {
    assert.equal(studioAllows(studioRolesFor(fixtures[role].user, fixtures[role].context), "READ_PROTECTED_KEY"), false, role);
  }
  assert.equal(studioAllows(studioRolesFor(fixtures.MODERATOR.user, fixtures.MODERATOR.context), "READ_PROTECTED_KEY"), true);
});

test("school and campus bound every action, and the refusal carries no record contents", async () => {
  const otherSchool = scope({ schoolId: "school-b" }), otherCampus = scope({ campusId: "campus-b" });
  for (const role of STUDIO_ROLES) {
    for (const action of STUDIO_ACTIONS) assert.equal(studioActionDecision(fixtures[role].user, action, { ...otherSchool, hasSupportGrant: false }, grants()).allowed, false, `${role} / ${action}`);
  }
  assert.equal(studioActionDecision(fixtures.AUTHOR.user, "AUTHOR_ITEM", otherCampus, grants()).allowed, false);
  assert.equal(studioActionDecision(actor("SUPER_ADMIN", { campusId: null }), "APPROVE_VERSION", otherCampus, grants()).allowed, true);
  assert.equal(studioActionDecision(actor("SUPER_ADMIN", { campusId: null }), "APPROVE_VERSION", otherSchool, grants()).allowed, false);
  await assert.rejects(
    () => assertStudioAction(fixtures.AUTHOR.user, "AUTHOR_ITEM", { ...otherCampus, assignmentId: "assignment-secret" }, grants()),
    (error: unknown) => {
      assert.ok(error instanceof SchoolAiError && error.status === 403 && error.code === "STUDIO_ACTION_REFUSED");
      assert.equal(error.message.includes("assignment-secret"), false);
      return true;
    },
  );
});

test("a revoked grant refuses the next request, and a candidate stands on no module grant", async () => {
  assert.equal(studioActionDecision(fixtures.ACADEMIC_APPROVER.user, "APPROVE_VERSION", fixtures.ACADEMIC_APPROVER.context, grants({ ai: { canEdit: false } })).allowed, false);
  assert.equal(studioActionDecision(fixtures.AUTHOR.user, "AUTHOR_ITEM", fixtures.AUTHOR.context, grants({ ai: { canAdd: false } })).allowed, false);
  assert.equal(studioActionDecision(fixtures.INVIGILATOR.user, "GRANT_EXTRA_TIME", fixtures.INVIGILATOR.context, grants({ exams: { canView: false } })).allowed, false);
  assert.equal(studioActionDecision(fixtures.MODERATOR.user, "READ_PROTECTED_KEY", fixtures.MODERATOR.context, undefined).allowed, false);
  assert.equal(studioActionDecision(fixtures.CANDIDATE.user, "READ_CANDIDATE_PROJECTION", fixtures.CANDIDATE.context, undefined).allowed, true);
  assert.equal(await assertStudioAction(fixtures.CANDIDATE.user, "READ_OWN_RESULT", fixtures.CANDIDATE.context), "CANDIDATE");
});

test("an author's subject scope is resolved from the current assignment rows", async () => {
  const client = (rows: Array<{ id: string; classId: string; campusId: string }>) =>
    ({ subject: { findMany: async () => rows } }) as unknown as TxClient;
  const context: StudioActionContext = { schoolId: "school-a", campusId: "campus-a", subjectId: "math", classId: "grade-8" };
  assert.equal(await assertStudioAction(fixtures.AUTHOR.user, "AUTHOR_ITEM", context, grants(), client([{ id: "math", classId: "grade-8", campusId: "campus-a" }])), "AUTHOR");
  await assert.rejects(() => assertStudioAction(fixtures.AUTHOR.user, "AUTHOR_ITEM", context, grants(), client([])), { status: 403 });
  await assert.rejects(() => assertStudioAction(fixtures.AUTHOR.user, "AUTHOR_ITEM", context, grants(), client([{ id: "math", classId: "grade-9", campusId: "campus-a" }])), { status: 403 });
});

test("every performed action is recorded with actor, role, scope, target version and authoritative time", async () => {
  const at = new Date("2026-05-04T08:30:00.000Z");
  const entry = studioActionAuditEntry(fixtures.ACADEMIC_APPROVER.user, { action: "APPROVE_VERSION", role: "ACADEMIC_APPROVER", targetId: "record-a", targetVersion: 7, at });
  assert.equal(entry.schoolId, "school-a");
  assert.equal(entry.recordId, "record-a");
  assert.equal(entry.userId, "actor-a");
  assert.deepEqual(entry.newValue, { action: "APPROVE_VERSION", role: "ACADEMIC_APPROVER", platformRole: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a", targetId: "record-a", targetVersion: 7, at: at.toISOString() });
  const written: unknown[] = [];
  const tx = { auditLog: { create: async (args: unknown) => { written.push(args); } } } as unknown as TxClient;
  await recordStudioAction(tx, fixtures.MODERATOR.user, { action: "RECORD_MODERATION", role: "MODERATOR", targetId: "attempt-a", targetVersion: 2, at });
  assert.deepEqual(written, [{ data: studioActionAuditEntry(fixtures.MODERATOR.user, { action: "RECORD_MODERATION", role: "MODERATOR", targetId: "attempt-a", targetVersion: 2, at }) }]);
});

test("the allow-list cannot be widened at runtime", () => {
  assert.equal(Object.isFrozen(STUDIO_AUTHORITY), true);
  assert.throws(() => (STUDIO_AUTHORITY.INVIGILATOR as Set<StudioAction>).add("READ_PROTECTED_KEY"), TypeError);
  assert.equal(STUDIO_AUTHORITY.INVIGILATOR.has("READ_PROTECTED_KEY"), false);
});
