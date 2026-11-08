// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
/**
 * Property 32, the universal form. `exam-studio-access.test.ts` already names the pairs Requirement 2
 * spells out one by one; this file asserts the statement those examples are instances of, so a column
 * or a role added to `studio-access.ts` is covered the moment it is exported rather than when someone
 * remembers to add an example.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16**
 *
 * R2.4 is the one criterion the matrix cannot answer — it reads the school's Delivery_Policy record
 * rather than a table cell — so it is the last clause here, over `approvalSeparation` in `access.ts`.
 *
 * Every sweep runs `SEEDS_100` through `forEachSeed`, which prints the failing seed and a shrunk
 * input, so a counterexample reproduces as a plain unit test with `xorshift(<seed>)`.
 *
 * **The oracle.** The expected decision is recomputed from the exported tables — `STUDIO_AUTHORITY`,
 * `STUDIO_ROLE_SCOPE`, `STUDIO_ACTION_SCOPE`, `STUDIO_ROLE_GRANTS` — composed by this file's own
 * model of Requirement 2's role sources and scope predicates. The tables are the specification
 * surface; what is under test is the composition over them: that a role is held only with every
 * declared scope satisfied, that an action is permitted only through a held role that lists it and
 * stands on its recorded grants, that the action's own scope gates it wherever it is held, and that
 * nothing outside those tables can widen the answer. The model is recomputed from each `(user,
 * context)` pair rather than read from a generated intent, so every shrunk candidate is a valid
 * input and the reported counterexample is a real one.
 *
 * The decision under test is pure and takes the snapshot as an argument, so these sweeps touch no
 * database: every context fixes `isAssignedSubject`, which is the one field `assertStudioAction`
 * would otherwise resolve through `getAssignedWorkspaceSubjects`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { forEachSeed, forEachSeedAsync, SEEDS_100, type Rng } from "./exam-studio-generators";
import type { AuthUser } from "../../src/lib/auth";
import type { PermissionAction, PermissionFlags, PermissionModule } from "../../src/lib/permissions";
import {
  approvalSeparation, assertApprovalSeparation, isSchoolAiManager, SCHOOL_AI_STAFF_ROLES, SchoolAiError,
  type ApprovalSeparationRecord, type WorkspacePermissionSnapshot,
} from "../../src/lib/school-ai/access";
import {
  APPROVAL_SEPARATION_REASONS, PLATFORM_DEFAULT_DELIVERY_POLICY,
  type ApprovalSeparationDecision, type ApprovalSeparationReason, type DeliveryPolicySource,
  type ResolvedDeliveryPolicy, type SeparationOfDuties,
} from "../../src/lib/school-ai/delivery-policy";
import {
  assertStudioAction, STUDIO_ACTION_AUDIT_TABLE, STUDIO_ACTION_SCOPE, STUDIO_ACTIONS, STUDIO_AUTHORITY,
  STUDIO_ROLE_GRANTS, STUDIO_ROLE_SCOPE, STUDIO_ROLES, studioActionAuditEntry, studioActionDecision,
  studioAllows, studioRolesFor,
  type StudioAction, type StudioActionContext, type StudioRole, type StudioScope,
} from "../../src/lib/school-ai/studio-access";

// ---------------------------------------------------------------------------------------------
// The generated input: the whole platform-role list, a context per actor, and a grant record
// ---------------------------------------------------------------------------------------------

/** Every `UserRole` in `prisma/schema.prisma`, so no platform role is left out of the sweep. */
const PLATFORM_ROLES: readonly AuthUser["role"][] = ["APP_OWNER", "SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"];

const PERMISSION_ACTIONS: readonly PermissionAction[] = ["view", "add", "edit", "delete"];
/** `ai` and `exams` are the modules `STUDIO_ROLE_GRANTS` stands on; `students` is carried to show an unrelated grant decides nothing. */
const SNAPSHOT_MODULES: readonly PermissionModule[] = ["ai", "exams", "students"];
type GrantKey = `${PermissionModule}.${PermissionAction}`;
const GRANT_KEYS: readonly GrantKey[] = SNAPSHOT_MODULES.flatMap((module) => PERMISSION_ACTIONS.map((action) => `${module}.${action}` as GrantKey));
/** The grant keys some studio role actually declares. Every other key is noise the decision must ignore. */
const REQUIRED_GRANT_KEYS: ReadonlySet<string> = new Set(STUDIO_ROLES.flatMap((role) => STUDIO_ROLE_GRANTS[role].map(([module, action]) => `${module}.${action}`)));

type GeneratedActor = { user: AuthUser; context: StudioActionContext };
type GrantRecord = { grants: Record<GrantKey, boolean>; omittedModules: PermissionModule[]; snapshotPresent: boolean };
type AuthorityCase = GrantRecord & {
  actors: GeneratedActor[];
  /** Applied cumulatively, so authority may only ever narrow. Repeats and unrelated keys are deliberate. */
  revocations: GrantKey[];
  audit: { targetId: string; targetVersion: number; atMs: number; campusId?: string | null };
};

const SCHOOL_IDS = ["school-a", "school-b", ""] as const;
const CAMPUS_IDS = ["campus-a", "campus-b", null] as const;
/** A scope flag left unset is a real request shape, and the decision reads it with `=== true`. */
const maybeTrue = (rng: Rng, numerator: number) => (rng.bool(1, 8) ? undefined : rng.bool(numerator, 4));

function contextFor(rng: Rng, user: AuthUser): StudioActionContext {
  return {
    schoolId: rng.bool(4, 5) ? user.schoolId : rng.pick(SCHOOL_IDS),
    campusId: rng.bool(4, 5) ? user.campusId : rng.pick(CAMPUS_IDS),
    subjectId: rng.bool(4, 5) ? "math" : null,
    classId: rng.bool(4, 5) ? "grade-8" : null,
    // A record identifier a refusal must never name (R27.4).
    assignmentId: `assignment-${rng.hex(8)}`,
    // Always a boolean: the subject lookup is `exam-studio-access.test.ts`'s case, and fixing it here
    // keeps this sweep free of `getAssignedWorkspaceSubjects` and of any database.
    isAssignedSubject: rng.bool(3, 4),
    isAssignedInvigilator: maybeTrue(rng, 3),
    isModerating: maybeTrue(rng, 3),
    isOwnAttempt: maybeTrue(rng, 3),
    isLinkedGuardian: maybeTrue(rng, 3),
    attemptWindowOpen: maybeTrue(rng, 3),
    resultReleased: maybeTrue(rng, 3),
    hasSupportGrant: maybeTrue(rng, 3),
  };
}

/** One actor per platform role, each with its own scope context, plus the grant record and a revocation order. */
function authorityCase(rng: Rng): AuthorityCase {
  const actors = rng.shuffle(PLATFORM_ROLES).map((role) => {
    const user: AuthUser = {
      role,
      userId: `actor-${rng.hex(8)}`,
      email: `actor-${rng.hex(4)}@example.invalid`,
      schoolId: rng.bool(5, 6) ? "school-a" : rng.pick(SCHOOL_IDS),
      campusId: rng.bool(5, 6) ? "campus-a" : rng.pick(CAMPUS_IDS),
    };
    return { user, context: contextFor(rng, user) };
  });
  return {
    actors,
    grants: Object.fromEntries(GRANT_KEYS.map((key) => [key, rng.bool(5, 6)])) as Record<GrantKey, boolean>,
    omittedModules: rng.bool(1, 6) ? [rng.pick(SNAPSHOT_MODULES)] : [],
    snapshotPresent: rng.bool(7, 8),
    revocations: rng.shuffle([...rng.subset(GRANT_KEYS, 1, 6), ...rng.subset(GRANT_KEYS, 0, 2)]),
    audit: {
      targetId: `record-${rng.hex(8)}`,
      targetVersion: rng.int(1, 99),
      atMs: rng.int(0, 10_000_000),
      campusId: rng.bool(1, 3) ? (rng.bool() ? `campus-${rng.hex(4)}` : null) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The oracle: Requirement 2 restated over the exported tables
// ---------------------------------------------------------------------------------------------

const isStaff = (user: AuthUser) => (SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role);

/** Which platform role each studio role is derived from — the words of Requirement 2, not a new enum. */
const MODEL_ROLE_SOURCE: Readonly<Record<StudioRole, (user: AuthUser) => boolean>> = {
  // A manager authors as well as approves, which is what keeps R2.4's separation check reachable.
  AUTHOR: (user) => isStaff(user) && (isSchoolAiManager(user) || user.role === "TEACHER"),
  ACADEMIC_APPROVER: (user) => isStaff(user) && isSchoolAiManager(user),
  INVIGILATOR: isStaff,
  MODERATOR: isStaff,
  CANDIDATE: (user) => user.role === "STUDENT",
  GUARDIAN: (user) => user.role === "PARENT",
  PLATFORM_SUPPORT: (user) => user.role === "APP_OWNER",
};

const MODEL_SCOPE: Readonly<Record<StudioScope, (user: AuthUser, context: StudioActionContext) => boolean>> = {
  ACTOR_SCHOOL: (user, context) => Boolean(user.schoolId) && context.schoolId === user.schoolId,          // R27.1
  ACTOR_CAMPUS: (user, context) => user.role === "SUPER_ADMIN" || (Boolean(user.campusId) && context.campusId === user.campusId), // R27.2
  ASSIGNED_SUBJECT: (_user, context) => context.isAssignedSubject === true,                               // R2.1
  ASSIGNED_SESSION: (user, context) => context.isAssignedInvigilator === true || isSchoolAiManager(user),  // R2.5, R15.9
  UNDER_MODERATION: (_user, context) => context.isModerating === true,                                    // R2.7
  OWN_ATTEMPT: (_user, context) => context.isOwnAttempt === true,                                         // R2.9
  LINKED_CHILD: (_user, context) => context.isLinkedGuardian === true,                                    // R2.11
  SUPPORT_GRANT: (_user, context) => context.hasSupportGrant === true,                                    // R2.13
  ATTEMPT_WINDOW_OPEN: (_user, context) => context.attemptWindowOpen === true,                            // R2.10
  RESULT_RELEASED: (_user, context) => context.resultReleased === true,                                   // R2.9, R2.12
};

/** A role is held only when its platform source matches and every scope it declares is satisfied. Kept in table order, so the first match is the deciding role. */
const modelRoles = (user: AuthUser, context: StudioActionContext): StudioRole[] =>
  STUDIO_ROLES.filter((role) => MODEL_ROLE_SOURCE[role](user) && STUDIO_ROLE_SCOPE[role].every((scope) => MODEL_SCOPE[scope](user, context)));

/** R2.15, R27.9: the role stands only while every grant it declares is present in the snapshot that request carries. */
function modelGrantsSatisfied(role: StudioRole, record: GrantRecord): boolean {
  const required = STUDIO_ROLE_GRANTS[role];
  if (required.length === 0) return true;      // A candidate, a guardian and platform support stand on no module grant.
  if (!record.snapshotPresent) return false;   // Fail closed: no snapshot proves no grant.
  return required.every(([module, action]) => !record.omittedModules.includes(module) && record.grants[`${module}.${action}`] === true);
}

/** The whole expected decision: action scope first, then the first held role that lists the action and stands on its grants. */
function modelDecision(actor: GeneratedActor, action: StudioAction, record: GrantRecord): StudioRole | null {
  if (!(STUDIO_ACTION_SCOPE[action] ?? []).every((scope) => MODEL_SCOPE[scope](actor.user, actor.context))) return null;
  return modelRoles(actor.user, actor.context).find((role) => STUDIO_AUTHORITY[role].has(action) && modelGrantsSatisfied(role, record)) ?? null;
}

/** The snapshot the generated grant record describes. An omitted module is a snapshot with no row for it at all. */
function snapshotOf(record: GrantRecord): WorkspacePermissionSnapshot | undefined {
  if (!record.snapshotPresent) return undefined;
  const flags = (module: PermissionModule): PermissionFlags => ({
    canView: record.grants[`${module}.view`] === true,
    canAdd: record.grants[`${module}.add`] === true,
    canEdit: record.grants[`${module}.edit`] === true,
    canDelete: record.grants[`${module}.delete`] === true,
  });
  return new Map(SNAPSHOT_MODULES.filter((module) => !record.omittedModules.includes(module)).map((module) => [module, flags(module)]));
}

const permittedActions = (actor: GeneratedActor, record: GrantRecord): StudioAction[] => {
  const snapshot = snapshotOf(record);
  return STUDIO_ACTIONS.filter((action) => studioActionDecision(actor.user, action, actor.context, snapshot).allowed);
};

const describe = (actor: GeneratedActor, action: StudioAction) => `${actor.user.role} / ${action}`;

// ---------------------------------------------------------------------------------------------
// Property 32, clause one: the matrix decides, and nothing outside it does
// ---------------------------------------------------------------------------------------------

// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
test("for every studio role and every studio action the decision equals the matrix, the scopes and the recorded grants", () => {
  // Accumulated across the sweep, then asserted: the generated contexts really do hold every role, so
  // the cross-product is exercised rather than merely enumerated.
  const exercised = new Set<string>();
  let iterations = 0;

  forEachSeed(authorityCase, (value) => {
    iterations += 1;
    const snapshot = snapshotOf(value);
    for (const actor of value.actors) {
      const expectedRoles = modelRoles(actor.user, actor.context);
      const roles = studioRolesFor(actor.user, actor.context);
      assert.deepEqual([...roles], expectedRoles, `roles held by ${actor.user.role}`);
      for (const role of expectedRoles) for (const action of STUDIO_ACTIONS) exercised.add(`${role}/${action}`);

      for (const action of STUDIO_ACTIONS) {
        const expected = modelDecision(actor, action, value);
        const decision = studioActionDecision(actor.user, action, actor.context, snapshot);
        assert.equal(decision.allowed, expected !== null, `decision for ${describe(actor, action)}`);
        // R2.16 records the role that decided, so it must be the single first match in table order.
        assert.equal(decision.role, expected, `deciding role for ${describe(actor, action)}`);
        assert.deepEqual([...decision.roles], expectedRoles, `decision roles for ${describe(actor, action)}`);
        // Absence from the matrix is the refusal: no scope, grant or platform role can add an action back.
        if (!expectedRoles.some((role) => STUDIO_AUTHORITY[role].has(action))) assert.equal(decision.allowed, false, `absent from the matrix yet permitted: ${describe(actor, action)}`);
        if (decision.allowed) assert.equal(studioAllows(roles, action), true, `permitted without matrix membership: ${describe(actor, action)}`);
        if (!studioAllows(roles, action)) assert.equal(decision.allowed, false, `permitted though no held role lists it: ${describe(actor, action)}`);
        // `studioAllows` is the matrix on its own, which is why the two lines above are implications
        // rather than an equality: it reads neither the action scope nor the recorded grants. With both
        // in place it must agree with the decision exactly, which bounds how much wider it can ever be.
        const unconditional = (STUDIO_ACTION_SCOPE[action] ?? []).every((scope) => MODEL_SCOPE[scope](actor.user, actor.context)) && expectedRoles.every((role) => modelGrantsSatisfied(role, value));
        if (unconditional) assert.equal(studioAllows(roles, action), decision.allowed, `the matrix and the decision disagree with every scope and grant satisfied: ${describe(actor, action)}`);
      }
    }
  }, SEEDS_100);

  assert.ok(iterations >= 100, `the sweep ran ${iterations} iterations, fewer than the 100 the strategy requires`);
  const unexercised = STUDIO_ROLES.flatMap((role) => STUDIO_ACTIONS.map((action) => `${role}/${action}`)).filter((pair) => !exercised.has(pair));
  assert.deepEqual(unexercised, [], "the sweep never held some roles, so part of the cross-product was never decided");
});

// ---------------------------------------------------------------------------------------------
// Property 32, clause two: a revoked grant narrows authority and never widens it
// ---------------------------------------------------------------------------------------------

// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
test("every revoked-grant sequence narrows authority and no revocation ever widens it", () => {
  // A monotonicity property passes vacuously if nothing ever narrowed, so the sweep counts the
  // revocations that actually removed an action and refuses to pass without them.
  let narrowed = 0;
  forEachSeed(authorityCase, (value) => {
    const everyGrant: GrantRecord = { grants: Object.fromEntries(GRANT_KEYS.map((key) => [key, true])) as Record<GrantKey, boolean>, omittedModules: [], snapshotPresent: true };
    const widest = value.actors.map((actor) => permittedActions(actor, everyGrant));

    let record: GrantRecord = { grants: value.grants, omittedModules: value.omittedModules, snapshotPresent: true };
    const previous = value.actors.map((actor) => permittedActions(actor, record));
    for (const key of value.revocations) {
      const stood = record.grants[key] === true && REQUIRED_GRANT_KEYS.has(key);
      record = { ...record, grants: { ...record.grants, [key]: false } };
      value.actors.forEach((actor, index) => {
        const current = permittedActions(actor, record);
        for (const action of current) assert.ok(previous[index].includes(action), `revoking ${key} widened ${describe(actor, action)}`);
        // Revoking a grant no studio role stands on, or one already absent, decides nothing.
        if (!stood) assert.deepEqual(current, previous[index], `revoking the unrelated grant ${key} changed authority for ${actor.user.role}`);
        if (current.length < previous[index].length) narrowed += 1;
        previous[index] = current;
      });
    }

    const stripped: GrantRecord = { ...record, grants: Object.fromEntries(GRANT_KEYS.map((key) => [key, false])) as Record<GrantKey, boolean> };
    const withoutSnapshot: GrantRecord = { ...record, snapshotPresent: false };
    value.actors.forEach((actor, index) => {
      // Every grant gone, and no snapshot at all, leave exactly the roles that stand on no module grant.
      const standingOnNoGrant = modelRoles(actor.user, actor.context).filter((role) => STUDIO_ROLE_GRANTS[role].length === 0);
      for (const narrowed of [stripped, withoutSnapshot]) {
        for (const action of permittedActions(actor, narrowed)) {
          assert.ok(standingOnNoGrant.some((role) => STUDIO_AUTHORITY[role].has(action)), `${describe(actor, action)} survived every revocation`);
          assert.ok(widest[index].includes(action), `${describe(actor, action)} is permitted with no grant yet refused with all of them`);
        }
      }
      // R2.15: the decision reads the snapshot it is handed, so the next request with the wider snapshot
      // is decided afresh. Nothing from the narrowed requests persists.
      assert.deepEqual(permittedActions(actor, everyGrant), widest[index], `authority for ${actor.user.role} did not come from the snapshot of this request`);
    });
  }, SEEDS_100);

  assert.ok(narrowed > 0, "no generated revocation narrowed authority, so the sequences proved nothing");
});

// ---------------------------------------------------------------------------------------------
// Property 32, clause three: every permitted action is recorded in full
// ---------------------------------------------------------------------------------------------

// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
test("every permitted action records actor, role, school, campus, action, target, version and the authoritative instant", () => {
  const recordedRoles = new Set<StudioRole>();
  forEachSeed(authorityCase, (value) => {
    const snapshot = snapshotOf(value);
    const at = new Date(value.audit.atMs);
    for (const actor of value.actors) {
      for (const action of STUDIO_ACTIONS) {
        const decision = studioActionDecision(actor.user, action, actor.context, snapshot);
        if (!decision.allowed || !decision.role) continue;
        recordedRoles.add(decision.role);
        const entry = studioActionAuditEntry(actor.user, { action, role: decision.role, targetId: value.audit.targetId, targetVersion: value.audit.targetVersion, at, campusId: value.audit.campusId });
        assert.deepEqual(entry, {
          schoolId: actor.user.schoolId,
          tableName: STUDIO_ACTION_AUDIT_TABLE,
          recordId: value.audit.targetId,
          userId: actor.user.userId,
          newValue: {
            action,
            role: decision.role,
            platformRole: actor.user.role,
            schoolId: actor.user.schoolId,
            campusId: value.audit.campusId !== undefined ? value.audit.campusId : actor.user.campusId,
            targetId: value.audit.targetId,
            targetVersion: value.audit.targetVersion,
            // The authoritative instant the decision used, never the wall clock at recording time.
            at: at.toISOString(),
          },
        }, `authority record for ${describe(actor, action)}`);
      }
    }
  }, SEEDS_100);

  // Every role that can decide an action must have had a record built for it, or the sweep recorded nothing.
  assert.deepEqual([...recordedRoles].sort(), [...STUDIO_ROLES].sort(), "some role never decided a permitted action, so its authority record was never built");
});

// ---------------------------------------------------------------------------------------------
// Property 32, clause four: the gate callers use agrees with the decision, and its refusal says nothing else
// ---------------------------------------------------------------------------------------------

// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
test("the asserting gate returns the deciding role or refuses with the action alone", async () => {
  // The asynchronous companion to the sweeps above. `forEachSeedAsync` reports the failing seed and the
  // input; the pure decision it mirrors is the one the shrinking sweeps already cover, so a failure
  // here reproduces through `studioActionDecision` with the printed seed.
  const outcomes = { permitted: 0, refused: 0 };
  await forEachSeedAsync(authorityCase, async (value) => {
    // The gate is always handed a snapshot here. Omitting one is only safe where no held role stands on
    // a module grant, because otherwise the gate loads one itself and this sweep runs without a
    // database; the no-snapshot decision is covered by the pure sweeps above.
    const snapshot = snapshotOf({ ...value, snapshotPresent: true });
    for (const actor of value.actors) {
      const selfContained = [...studioRolesFor(actor.user, actor.context)].every((role) => STUDIO_ROLE_GRANTS[role].length === 0);
      for (const action of STUDIO_ACTIONS) {
        const decision = studioActionDecision(actor.user, action, actor.context, snapshot);
        for (const permissions of selfContained ? [snapshot, undefined] : [snapshot]) {
          if (decision.allowed) {
            outcomes.permitted += 1;
            assert.equal(await assertStudioAction(actor.user, action, actor.context, permissions), decision.role, `gate for ${describe(actor, action)}`);
            continue;
          }
          outcomes.refused += 1;
          await assert.rejects(() => assertStudioAction(actor.user, action, actor.context, permissions), (error: unknown) => {
            assert.ok(error instanceof SchoolAiError, `gate for ${describe(actor, action)} threw ${String(error)}`);
            assert.equal(error.status, 403, `status for ${describe(actor, action)}`);
            assert.equal(error.code, "STUDIO_ACTION_REFUSED", `code for ${describe(actor, action)}`);
            assert.ok(error.message.includes(action), `refusal for ${describe(actor, action)} does not name the action`);
            // R27.4: the refusal names the action only, never the record it was about.
            for (const identifier of [actor.context.assignmentId, value.audit.targetId, actor.user.userId]) {
              if (identifier) assert.equal(error.message.includes(identifier), false, `refusal for ${describe(actor, action)} named ${identifier}`);
            }
            return true;
          });
        }
      }
    }
  }, SEEDS_100);

  assert.ok(outcomes.permitted > 0 && outcomes.refused > 0, `the gate sweep saw ${outcomes.permitted} permitted and ${outcomes.refused} refused calls, so one side was never reached`);
});

// ---------------------------------------------------------------------------------------------
// Property 32, clause five: R2.4, the criterion that is not a matrix cell
// ---------------------------------------------------------------------------------------------

type SeparationPolicy = { source: DeliveryPolicySource; separationOfDuties: SeparationOfDuties };
type SeparationTrial = { createdById: string; updatedById: string; approverId: string };
type SeparationCase = { policies: SeparationPolicy[]; trials: SeparationTrial[] };

/** A known actor, a second known actor, an absent one and a whitespace-only one, plus a drawn identifier. */
const SEPARATION_ACTOR_IDS = ["approver-1", "author-9", "", "   "] as const;

function separationCase(rng: Rng): SeparationCase {
  // The platform default carries its own separation setting, which is `NOT_REQUIRED`: a refusal
  // sourced from the platform default is not a reachable state, so it is not generated as one.
  const reachable: SeparationPolicy[] = [
    { source: "PLATFORM_DEFAULT", separationOfDuties: PLATFORM_DEFAULT_DELIVERY_POLICY.separationOfDuties },
    { source: "SCHOOL_POLICY", separationOfDuties: "REQUIRED" },
    { source: "SCHOOL_POLICY", separationOfDuties: "NOT_REQUIRED" },
  ];
  const pool = [...SEPARATION_ACTOR_IDS, `actor-${rng.hex(6)}`];
  return {
    policies: rng.subset(reachable, 1, reachable.length),
    trials: Array.from({ length: rng.int(3, 8) }, () => ({ createdById: rng.pick(pool), updatedById: rng.pick(pool), approverId: rng.pick(pool) })),
  };
}

const resolvedPolicyOf = (policy: SeparationPolicy): ResolvedDeliveryPolicy => {
  const resolved = { ...PLATFORM_DEFAULT_DELIVERY_POLICY, separationOfDuties: policy.separationOfDuties };
  return policy.source === "SCHOOL_POLICY"
    ? { policy: resolved, source: "SCHOOL_POLICY", recordId: "policy-1", version: 3, defaultedBecause: null }
    : { policy: resolved, source: "PLATFORM_DEFAULT", recordId: null, version: null, defaultedBecause: "NO_APPROVED_POLICY" };
};

/**
 * R2.4 restated. Separation not required allows; otherwise every authoring actor must be known and
 * distinct from the approver, and the first authoring actor that refuses decides. Both authoring
 * actors count, which is stricter than the letter of the criterion and is what `access.ts` documents.
 */
function modelSeparation(policy: SeparationPolicy, trial: SeparationTrial): ApprovalSeparationDecision {
  const { source, separationOfDuties } = policy;
  if (separationOfDuties === "NOT_REQUIRED") return { allowed: true, reason: "SEPARATION_NOT_REQUIRED", separationOfDuties, source };
  const approver = trial.approverId.trim();
  for (const authored of [trial.createdById, trial.updatedById]) {
    const author = authored.trim();
    if (!author || !approver) return { allowed: false, reason: "UNDETERMINED_ACTOR", separationOfDuties, source };
    if (author === approver) return { allowed: false, reason: "SAME_ACTOR", separationOfDuties, source };
  }
  return { allowed: true, reason: "DISTINCT_ACTORS", separationOfDuties, source };
}

// Feature: ai-exam-studio, Property 32: The authority matrix decides every studio action
test("approval separation permits an approver exactly when the policy allows it or every authoring actor is known and distinct", () => {
  const reasons = new Set<ApprovalSeparationReason>();

  forEachSeed(separationCase, (value) => {
    for (const policy of value.policies) {
      const resolved = resolvedPolicyOf(policy);
      for (const trial of value.trials) {
        const record: ApprovalSeparationRecord = { createdById: trial.createdById, updatedById: trial.updatedById };
        const approver: AuthUser = { role: "PRINCIPAL", userId: trial.approverId, email: "approver@example.invalid", schoolId: "school-a", campusId: "campus-a" };
        const where = `${policy.source}/${policy.separationOfDuties} created=${JSON.stringify(trial.createdById)} updated=${JSON.stringify(trial.updatedById)} approver=${JSON.stringify(trial.approverId)}`;
        const expected = modelSeparation(policy, trial);
        const decision = approvalSeparation(approver, record, resolved);
        // The decision names the policy source that produced it, so an interface never reports a
        // refusal without saying whose policy required it.
        assert.deepEqual(decision, expected, `separation decision for ${where}`);
        reasons.add(decision.reason);

        if (decision.allowed) {
          assert.deepEqual(assertApprovalSeparation(approver, record, resolved), expected, `gate for ${where}`);
          continue;
        }
        assert.throws(() => assertApprovalSeparation(approver, record, resolved), (error: unknown) => {
          assert.ok(error instanceof SchoolAiError, `gate for ${where} threw ${String(error)}`);
          assert.equal(error.status, 403, `status for ${where}`);
          assert.equal(error.code, "APPROVAL_SEPARATION_REQUIRED", `code for ${where}`);
          // R27.4 again: the refusal names the policy source and the remedy, never an actor.
          for (const identifier of [trial.createdById, trial.updatedById, trial.approverId].map((id) => id.trim()).filter((id) => id.length >= 6)) {
            assert.equal(error.message.includes(identifier), false, `refusal for ${where} named ${identifier}`);
          }
          return true;
        });
      }
    }
  }, SEEDS_100);

  assert.deepEqual([...reasons].sort(), [...APPROVAL_SEPARATION_REASONS].sort(), "the sweep never reached some separation outcome");
});
