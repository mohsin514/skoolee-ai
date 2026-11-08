/**
 * Exam Studio authority matrix (Requirement 2, Requirement 27).
 *
 * Requirement 2 is sixteen criteria of role authority. Scattered `if` statements
 * would guarantee drift, so the whole requirement is one frozen allow-list plus
 * one lookup. **An action absent from a role's set is refused** — R2.2, R2.6,
 * R2.8, R2.10, R2.12 and R2.14 are satisfied by absence, never by a negative
 * branch. The same holds one level up: a role is *held* only when every scope it
 * declares is satisfied, so an out-of-scope request refuses by holding no role.
 *
 * This file composes over `./access.ts` rather than replacing it:
 * `isSchoolAiManager` decides the approver role, `getAssignedWorkspaceSubjects`
 * decides an Author's subject scope, and `loadWorkspacePermissionSnapshot`
 * supplies the per-request permission snapshot that makes R2.15 true without a
 * cache to go stale.
 *
 * R2.4 (separation of authoring and approval) is deliberately absent: it reads
 * the school Delivery_Policy record and lands beside `assertApprovalRole` as
 * `assertApprovalSeparation`.
 */
import { getAssignedWorkspaceSubjects, isSchoolAiManager, loadWorkspacePermissionSnapshot, SCHOOL_AI_STAFF_ROLES, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import type { PermissionAction, PermissionFlags, PermissionModule } from "@/lib/permissions";

export const STUDIO_ROLES = ["AUTHOR", "ACADEMIC_APPROVER", "INVIGILATOR", "MODERATOR", "CANDIDATE", "GUARDIAN", "PLATFORM_SUPPORT"] as const;
/** A studio role is the platform `UserRole` plus scope, never a new database enum. */
export type StudioRole = (typeof STUDIO_ROLES)[number];

export const STUDIO_ACTIONS = [
  "AUTHOR_ITEM", "RUN_REHEARSAL", "APPROVE_VERSION", "APPROVE_POLICY",
  "ADMIT_CLIENT", "GRANT_EXTRA_TIME", "SUPERVISED_PAUSE", "REQUEST_LOCAL_RELEASE",
  "DECIDE_SIGNAL", "READ_SIGNAL", "READ_PROTECTED_KEY", "READ_RESPONSE_BODY",
  "READ_CAPTURE", "READ_UNRELEASED_RESULT", "RELEASE_RESULT",
  "AUTHORIZE_REMEDY", "RECORD_MODERATION", "EDIT_RELEASED_FORM",
  "DELETE_SIGNAL", "EXPORT_EVIDENCE_PACK", "READ_EXPOSURE_LEDGER",
  "READ_CANDIDATE_PROJECTION", "READ_OWN_RESULT", "READ_LINKED_RELEASED_RESULT",
  "READ_CONFIGURATION", "READ_FAILURE_DIAGNOSTICS",
  // Named by Requirement 2 but missing from the design sketch's union. Each is
  // a right the criteria state in words, so each needs its own matrix column:
  "READ_READINESS", "READ_ACTIVE_ATTEMPT", "READ_ACKNOWLEDGED_REVISION",       // R2.5
  "READ_DELIVERY_POLICY", "READ_ADMISSION_REASON",                             // R2.13, R15.1
  "READ_ATTEMPT_RECEIPT",                                                      // R2.9 — issued at submit, before release
  "READ_LINKED_RELEASED_FEEDBACK",                                             // R2.11
] as const;
export type StudioAction = (typeof STUDIO_ACTIONS)[number];

export const STUDIO_SCOPES = ["ACTOR_SCHOOL", "ACTOR_CAMPUS", "ASSIGNED_SUBJECT", "ASSIGNED_SESSION", "UNDER_MODERATION", "OWN_ATTEMPT", "LINKED_CHILD", "SUPPORT_GRANT", "ATTEMPT_WINDOW_OPEN", "RESULT_RELEASED"] as const;
export type StudioScope = (typeof STUDIO_SCOPES)[number];

/** Every fact the decision needs, resolved by the caller inside the same request. */
export interface StudioActionContext {
  /** The target record's school. R27.1 bounds every read, write and execution to it. */
  schoolId: string;
  /** The target record's campus. R27.2 bounds a non-super-administrator to their own. */
  campusId: string | null;
  subjectId?: string | null;
  classId?: string | null;
  assignmentId?: string | null;
  /** Left undefined, `assertStudioAction` resolves it with `getAssignedWorkspaceSubjects` (R2.1, R27.3, R27.5). */
  isAssignedSubject?: boolean;
  isAssignedInvigilator?: boolean;
  isModerating?: boolean;
  isOwnAttempt?: boolean;
  /** True only after the guardian relationship record matched this child, including that child's campus. */
  isLinkedGuardian?: boolean;
  attemptWindowOpen?: boolean;
  resultReleased?: boolean;
  /** True only after `requireSupportGrant` verified a live audited grant for the named school. */
  hasSupportGrant?: boolean;
}

/**
 * `Object.freeze` alone leaves `Set.prototype.add` reachable, so the own
 * properties shadow it: the matrix can be widened in source, never at runtime.
 */
function frozenActions(values: readonly StudioAction[]): ReadonlySet<StudioAction> {
  const refuse = (): never => { throw new TypeError("STUDIO_AUTHORITY is frozen. Widen the matrix in source, never at runtime."); };
  return Object.freeze(Object.assign(new Set(values), { add: refuse, delete: refuse, clear: refuse })) as unknown as ReadonlySet<StudioAction>;
}

/**
 * The explicit allow-list. Absence is the refusal.
 *
 * `EDIT_RELEASED_FORM` and `DELETE_SIGNAL` are held by **no** role: a sealed
 * Released_Form is immutable (R2.8, R8), and signal deletion belongs to the
 * recorded retention sweep rather than to any actor (R14.16).
 */
export const STUDIO_AUTHORITY: Readonly<Record<StudioRole, ReadonlySet<StudioAction>>> = Object.freeze({
  // R2.1 authoring and rehearsal inside the assigned subjects; R2.2 keeps approval,
  // admission, extra time, signal decisions and result release out. The Author reads
  // the keys it writes, the exposure ledger (R10.11) and signals on its own released
  // form (R14.14), and may export an Evidence_Pack inside its subject scope (R2.2).
  AUTHOR: frozenActions(["AUTHOR_ITEM", "RUN_REHEARSAL", "READ_PROTECTED_KEY", "READ_SIGNAL", "READ_EXPOSURE_LEDGER", "EXPORT_EVIDENCE_PACK"]),
  // R2.3 approval, policy approval, remedy authorization and result release. Reading
  // an unreleased result is what releasing one requires; configuration and diagnostics
  // are what approving a Delivery_Policy requires. Authoring stays with the AUTHOR
  // role, which a manager also holds, so it keeps the subject scope (R2.4 is reachable).
  ACADEMIC_APPROVER: frozenActions([
    "APPROVE_VERSION", "APPROVE_POLICY", "AUTHORIZE_REMEDY", "RELEASE_RESULT", "ADMIT_CLIENT",
    "DECIDE_SIGNAL", "READ_SIGNAL", "READ_PROTECTED_KEY", "READ_CAPTURE", "READ_UNRELEASED_RESULT",
    "READ_EXPOSURE_LEDGER", "EXPORT_EVIDENCE_PACK", "READ_CONFIGURATION", "READ_DELIVERY_POLICY",
    "READ_ADMISSION_REASON", "READ_FAILURE_DIAGNOSTICS",
  ]),
  // R2.5 readiness, active attempts, the last Acknowledged_Revision, signals, extra
  // time, a supervised pause and a Local_Release; R15.1 the admission reason code.
  // R2.6 is the absence of READ_PROTECTED_KEY, READ_RESPONSE_BODY and
  // READ_UNRELEASED_RESULT from this set, and READ_CAPTURE is absent too.
  INVIGILATOR: frozenActions(["READ_READINESS", "READ_ACTIVE_ATTEMPT", "READ_ACKNOWLEDGED_REVISION", "READ_SIGNAL", "READ_ADMISSION_REASON", "GRANT_EXTRA_TIME", "SUPERVISED_PAUSE", "REQUEST_LOCAL_RELEASE"]),
  // R2.7 responses, Protected_Key values and signals for attempts under moderation,
  // plus the moderation decision. R2.8 is the absence of EDIT_RELEASED_FORM,
  // ADMIT_CLIENT and DELETE_SIGNAL.
  MODERATOR: frozenActions(["READ_RESPONSE_BODY", "READ_PROTECTED_KEY", "READ_SIGNAL", "DECIDE_SIGNAL", "RECORD_MODERATION", "READ_UNRELEASED_RESULT", "READ_CAPTURE", "READ_EXPOSURE_LEDGER"]),
  // R2.9 is an "only" list: the projection of the assigned form, own responses, own
  // released result and own receipt. R2.10 is the absence of READ_PROTECTED_KEY and
  // READ_SIGNAL, the OWN_ATTEMPT scope, and the ATTEMPT_WINDOW_OPEN action scope.
  CANDIDATE: frozenActions(["READ_CANDIDATE_PROJECTION", "READ_RESPONSE_BODY", "READ_OWN_RESULT", "READ_ATTEMPT_RECEIPT"]),
  // R2.11 released results and released feedback for linked children. R2.12 is the
  // absence of signals, recordings, keys and unreleased results.
  GUARDIAN: frozenActions(["READ_LINKED_RELEASED_RESULT", "READ_LINKED_RELEASED_FEEDBACK"]),
  // R2.13 configuration, Delivery_Policy, admission reason codes and failure
  // diagnostics. R2.14 and R13.12 are the absence of READ_PROTECTED_KEY,
  // READ_RESPONSE_BODY and READ_CAPTURE.
  PLATFORM_SUPPORT: frozenActions(["READ_CONFIGURATION", "READ_DELIVERY_POLICY", "READ_ADMISSION_REASON", "READ_FAILURE_DIAGNOSTICS"]),
});

/** The scope every request for a role must satisfy, or the role is not held at all. */
export const STUDIO_ROLE_SCOPE: Readonly<Record<StudioRole, readonly StudioScope[]>> = Object.freeze({
  AUTHOR: Object.freeze(["ACTOR_SCHOOL", "ACTOR_CAMPUS", "ASSIGNED_SUBJECT"] as const),
  ACADEMIC_APPROVER: Object.freeze(["ACTOR_SCHOOL", "ACTOR_CAMPUS"] as const),
  INVIGILATOR: Object.freeze(["ACTOR_SCHOOL", "ACTOR_CAMPUS", "ASSIGNED_SESSION"] as const),
  MODERATOR: Object.freeze(["ACTOR_SCHOOL", "ACTOR_CAMPUS", "UNDER_MODERATION"] as const),
  CANDIDATE: Object.freeze(["ACTOR_SCHOOL", "ACTOR_CAMPUS", "OWN_ATTEMPT"] as const),
  // R27.2's campus bound travels with LINKED_CHILD: a guardian carries no campus of
  // their own, so the child's enrolment record is the authority for school and campus.
  GUARDIAN: Object.freeze(["ACTOR_SCHOOL", "LINKED_CHILD"] as const),
  // The audited grant names the school, and `requireSupportGrant` verifies it live
  // before any data access, so the grant is the scope.
  PLATFORM_SUPPORT: Object.freeze(["SUPPORT_GRANT"] as const),
});

/** Scope an action carries wherever it is held, regardless of the holding role. */
export const STUDIO_ACTION_SCOPE: Readonly<Partial<Record<StudioAction, readonly StudioScope[]>>> = Object.freeze({
  READ_CANDIDATE_PROJECTION: Object.freeze(["ATTEMPT_WINDOW_OPEN"] as const),  // R2.10
  READ_OWN_RESULT: Object.freeze(["RESULT_RELEASED"] as const),                // R2.9
  READ_LINKED_RELEASED_RESULT: Object.freeze(["RESULT_RELEASED"] as const),    // R2.11, R2.12
  READ_LINKED_RELEASED_FEEDBACK: Object.freeze(["RESULT_RELEASED"] as const),  // R2.11
});

/**
 * The recorded permission grants each role stands on. R2.15 and R27.9 are this
 * table read against a snapshot loaded inside the current request: a revoked
 * grant removes the role, and a role not held holds no action.
 *
 * A Candidate, a Guardian and Platform_Support stand on no module grant — their
 * authority is their own attempt, the guardian relationship record and the
 * audited support grant — so a module flag cannot interrupt a live attempt.
 */
export const STUDIO_ROLE_GRANTS: Readonly<Record<StudioRole, readonly (readonly [PermissionModule, PermissionAction])[]>> = Object.freeze({
  AUTHOR: Object.freeze([["ai", "view"], ["ai", "add"], ["exams", "edit"]] as const),
  ACADEMIC_APPROVER: Object.freeze([["ai", "view"], ["ai", "edit"], ["exams", "edit"]] as const),
  INVIGILATOR: Object.freeze([["ai", "view"], ["exams", "view"], ["exams", "edit"]] as const),
  MODERATOR: Object.freeze([["ai", "view"], ["exams", "view"], ["exams", "edit"]] as const),
  CANDIDATE: Object.freeze([] as const),
  GUARDIAN: Object.freeze([] as const),
  PLATFORM_SUPPORT: Object.freeze([] as const),
});

const isStudioStaff = (user: Pick<AuthUser, "role">) => (SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role);

/** The platform role each studio role is derived from — never a new database enum. */
const STUDIO_ROLE_SOURCE: Readonly<Record<StudioRole, (user: AuthUser) => boolean>> = Object.freeze({
  // A manager authors too, which is what makes R2.4's separation check reachable.
  AUTHOR: (user) => isStudioStaff(user) && (isSchoolAiManager(user) || user.role === "TEACHER"),
  ACADEMIC_APPROVER: (user) => isStudioStaff(user) && isSchoolAiManager(user),
  INVIGILATOR: (user) => isStudioStaff(user),
  MODERATOR: (user) => isStudioStaff(user),
  CANDIDATE: (user) => user.role === "STUDENT",
  GUARDIAN: (user) => user.role === "PARENT",
  PLATFORM_SUPPORT: (user) => user.role === "APP_OWNER",
});

const SCOPE_SATISFIED: Readonly<Record<StudioScope, (user: AuthUser, context: StudioActionContext) => boolean>> = Object.freeze({
  ACTOR_SCHOOL: (user, context) => Boolean(user.schoolId) && context.schoolId === user.schoolId,
  ACTOR_CAMPUS: (user, context) => user.role === "SUPER_ADMIN" || (Boolean(user.campusId) && context.campusId === user.campusId),
  ASSIGNED_SUBJECT: (_user, context) => context.isAssignedSubject === true,
  // R15.9: a manager supervises any sitting in their campus, an invigilator only
  // the sittings assigned to them.
  ASSIGNED_SESSION: (user, context) => context.isAssignedInvigilator === true || isSchoolAiManager(user),
  UNDER_MODERATION: (_user, context) => context.isModerating === true,
  OWN_ATTEMPT: (_user, context) => context.isOwnAttempt === true,
  LINKED_CHILD: (_user, context) => context.isLinkedGuardian === true,
  SUPPORT_GRANT: (_user, context) => context.hasSupportGrant === true,
  ATTEMPT_WINDOW_OPEN: (_user, context) => context.attemptWindowOpen === true,
  RESULT_RELEASED: (_user, context) => context.resultReleased === true,
});

const PERMISSION_FLAG: Readonly<Record<PermissionAction, keyof PermissionFlags>> = Object.freeze({ view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" });

/** R2.15, R27.9: the role stands only while every grant it declares is present in this request's snapshot. */
export function studioGrantsSatisfied(role: StudioRole, permissions?: WorkspacePermissionSnapshot): boolean {
  const required = STUDIO_ROLE_GRANTS[role];
  if (required.length === 0) return true;
  if (!permissions) return false;  // Fail closed: no snapshot proves no grant.
  return required.every(([module, action]) => permissions.get(module)?.[PERMISSION_FLAG[action]] === true);
}

/**
 * Maps the platform role plus assignment context onto the studio roles held.
 * A role whose scope is unmet is simply not held, so an out-of-school,
 * out-of-campus, unassigned-subject, unassigned-sitting, other-candidate or
 * unlinked-child request refuses by absence (R27.1–R27.5).
 */
export function studioRolesFor(user: AuthUser, context: StudioActionContext): ReadonlySet<StudioRole> {
  return new Set(STUDIO_ROLES.filter((role) => STUDIO_ROLE_SOURCE[role](user) && STUDIO_ROLE_SCOPE[role].every((scope) => SCOPE_SATISFIED[scope](user, context))));
}

/** The single lookup. R27.7 and R27.8 use it to shape a response for the roles actually held. */
export function studioAllows(roles: ReadonlySet<StudioRole>, action: StudioAction): boolean {
  for (const role of roles) if (STUDIO_AUTHORITY[role].has(action)) return true;
  return false;
}

export interface StudioDecision { allowed: boolean; role: StudioRole | null; roles: ReadonlySet<StudioRole> }

/** The whole decision, pure and database-free: role derivation, recorded grants, matrix, action scope. */
export function studioActionDecision(user: AuthUser, action: StudioAction, context: StudioActionContext, permissions?: WorkspacePermissionSnapshot): StudioDecision {
  const roles = studioRolesFor(user, context);
  const actionScope = STUDIO_ACTION_SCOPE[action] ?? [];
  if (!actionScope.every((scope) => SCOPE_SATISFIED[scope](user, context))) return { allowed: false, role: null, roles };
  for (const role of STUDIO_ROLES) {
    if (roles.has(role) && STUDIO_AUTHORITY[role].has(action) && studioGrantsSatisfied(role, permissions)) return { allowed: true, role, roles };
  }
  return { allowed: false, role: null, roles };
}

/** True when some role the actor could hold stands on a recorded module grant. */
function needsPermissionSnapshot(user: AuthUser, context: StudioActionContext): boolean {
  return [...studioRolesFor(user, context)].some((role) => STUDIO_ROLE_GRANTS[role].length > 0);
}

/**
 * R2.1, R27.3 and R27.5: the Author's subject scope is resolved from the current
 * assignment rows, so a subject removed from a teacher refuses that teacher's
 * next read and write. The client stays injectable, exactly as in `access.ts`.
 */
export async function resolveStudioSubjectScope(user: AuthUser, context: StudioActionContext, client?: TxClient): Promise<StudioActionContext> {
  if (context.isAssignedSubject !== undefined || !context.subjectId || !STUDIO_ROLE_SOURCE.AUTHOR(user)) return context;
  const subjects = await getAssignedWorkspaceSubjects(user, client);
  const isAssignedSubject = subjects.some((subject) => subject.id === context.subjectId && subject.campusId === context.campusId && (!context.classId || subject.classId === context.classId));
  return { ...context, isAssignedSubject };
}

/**
 * Throws `SchoolAiError(403)` unless some held studio role allows the action.
 * Loads the permission snapshot inside the same request when one is not supplied
 * (R2.15), and returns the role that decided so the caller can record it (R2.16).
 * The refusal names the action only — never the record or its contents (R27.4).
 */
export async function assertStudioAction(user: AuthUser, action: StudioAction, context: StudioActionContext, permissions?: WorkspacePermissionSnapshot, client?: TxClient): Promise<StudioRole> {
  const scoped = await resolveStudioSubjectScope(user, context, client);
  const snapshot = permissions ?? (needsPermissionSnapshot(user, scoped) ? await loadWorkspacePermissionSnapshot(user, client) : undefined);
  const decision = studioActionDecision(user, action, scoped, snapshot);
  if (!decision.allowed || !decision.role) throw new SchoolAiError(`This Exam Studio action is outside your current authority: ${action}.`, 403, "STUDIO_ACTION_REFUSED");
  return decision.role;
}

/**
 * R27.9: a saved operation is re-checked at execution time against the current
 * snapshot, never against the authority recorded when it was queued.
 */
export function assertStudioActionAtExecution(user: AuthUser, action: StudioAction, context: StudioActionContext, client?: TxClient): Promise<StudioRole> {
  return assertStudioAction(user, action, context, undefined, client);
}

export const STUDIO_ACTION_AUDIT_TABLE = "school_ai_studio_actions";

export interface StudioActionEntry {
  action: StudioAction;
  role: StudioRole;
  targetId: string;
  targetVersion: number;
  /** The authoritative server time the decision used. The audit row's own `createdAt` is the database clock. */
  at?: Date;
  campusId?: string | null;
}

/** R2.16, pure so the recorded shape is testable without a database. */
export function studioActionAuditEntry(user: AuthUser, entry: StudioActionEntry) {
  return {
    schoolId: user.schoolId,
    tableName: STUDIO_ACTION_AUDIT_TABLE,
    recordId: entry.targetId,
    userId: user.userId,
    newValue: {
      action: entry.action,
      role: entry.role,
      platformRole: user.role,
      schoolId: user.schoolId,
      campusId: entry.campusId !== undefined ? entry.campusId : user.campusId,
      targetId: entry.targetId,
      targetVersion: entry.targetVersion,
      at: (entry.at ?? new Date()).toISOString(),
    },
  };
}

/** Append-only authority record for every action in Requirement 2 (R2.16). */
export async function recordStudioAction(tx: TxClient, user: AuthUser, entry: StudioActionEntry): Promise<void> {
  await tx.auditLog.create({ data: studioActionAuditEntry(user, entry) });
}
