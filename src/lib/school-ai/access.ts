import { riskIndicatorSchema,riskModules } from "./school-operations-risk";
import { approvalSeparationDecision, type ApprovalSeparationDecision, type DeliveryPolicySource, type ResolvedDeliveryPolicy } from "./delivery-policy";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import type { PermissionAction, PermissionModule, PermissionFlags } from "@/lib/permissions";
import type { WorkspaceCapabilities, WorkspaceKind, WorkspaceStatus } from "./types";
import type { SCHOOL_AI_OPERATION_NAMES } from "./operations";

export class SchoolAiError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); this.name = "SchoolAiError"; }
}
export const SCHOOL_AI_STAFF_ROLES = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
export function isSchoolAiManager(user: Pick<AuthUser, "role">) {
  return ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(user.role);
}
/**
 * Role gating for the record kinds. A kind absent from a role's list is refused by absence, both
 * here and through `canAccessWorkspaceRecord` and `assertWorkspaceDomainPermission`.
 *
 * The three SKO-408 kinds are placed as follows:
 * - `DELIVERY_POLICY` is **manager-only**. It governs delivery and carries `separationOfDuties`
 *   (R2.4) and `maxForms` (R10.1), and R2.3 gives approval of a Delivery_Policy revision to the
 *   Academic_Approver, which `isSchoolAiManager` defines. A teacher never reaches it.
 * - `BRIEF` travels with `CURRICULUM` and `PAPER`: R3.1 has the teacher answering the brief for an
 *   assigned subject and class.
 * - `PRACTICE` also travels with them: R18.4 has the teacher's Recovery_Service producing a
 *   Practice_Set and R18.6 requires a *teacher* approval of it before it reaches a candidate. The
 *   design's record-kind table names the kind without splitting it by role, so the requirement is
 *   the citation for this placement.
 *
 * Every other staff role keeps the narrow `SOURCE`/`WORKFLOW` pair — none of the three is added
 * there, which is the fail-closed reading for a role no requirement names.
 */
export function allowedWorkspaceKinds(user: Pick<AuthUser, "role">): WorkspaceKind[] {
  if (isSchoolAiManager(user)) return ["ONBOARDING", "SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "POLICY", "DELIVERY_POLICY", "BRIEF", "PRACTICE"];
  if (user.role === "TEACHER") return ["SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "BRIEF", "PRACTICE"];
  if ((SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role)) return ["SOURCE", "WORKFLOW"];
  return [];
}
/**
 * The kinds whose domain authority is the `exams` permission module. Every assessment kind routes
 * through `assertWorkspaceDomainPermission` to this one module, exactly as `CURRICULUM` and `PAPER`
 * already did, so a revoked `exams` grant removes all of them together within the same request.
 */
export const EXAM_DOMAIN_WORKSPACE_KINDS: readonly WorkspaceKind[] = ["CURRICULUM", "PAPER", "DELIVERY_POLICY", "BRIEF", "PRACTICE"];
export function assertSchoolAiRole(user: AuthUser) {
  if (!user.schoolId || !(SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role)) throw new SchoolAiError("The school AI workspace is available to authorized school staff only.", 403);
  if (user.role !== "SUPER_ADMIN" && !user.campusId) throw new SchoolAiError("An active campus assignment is required.", 403);
}
export type WorkspacePermissionSnapshot = ReadonlyMap<string, PermissionFlags>;

/** Every executable school AI operation (the registry in ./execution keys on the same names). */
export type SchoolAiToolOperation = (typeof SCHOOL_AI_OPERATION_NAMES)[number];
/** Campus operations' own tools: setup, registers, risk decisions, announcements and promotion. */
const OPERATOR_TOOLS: readonly SchoolAiToolOperation[] = ["setup.apply_changes", "academics.setup_year", "attendance.record_register", "operations.record_risk_decision", "communications.queue_announcement", "students.promote_enrollment"];
/** Tuition tools — an operator holds them only while the campus has no accountant (`financeDesk`). */
const FINANCE_TOOLS: readonly SchoolAiToolOperation[] = ["finance.apply_operation", "fees.generate_invoices"];
/** Academic-lead tools: timetable drafts, publication and cover, exam sessions, year transition, curriculum. */
const ACADEMIC_TOOLS: readonly SchoolAiToolOperation[] = ["timetable.create_draft", "timetable.create_school_drafts", "timetable.publish_reviewed", "timetable.assign_substitutes", "exams.create_session_plan", "academics.transition_year", "curriculum.import_topics"];
/** The principal: academic tools plus risk decisions and announcements — no fees, finance, setup or promotion. */
const PRINCIPAL_TOOLS: readonly SchoolAiToolOperation[] = [...ACADEMIC_TOOLS, "operations.record_risk_decision", "communications.queue_announcement"];

/**
 * G42 [K-B2] — the explicit per-role, per-seat allow-list of executable AI tools. Pure so it is unit-tested
 * (tests/authz/principal-scope.test.ts). The group admin gets no campus write tools (drafts and insights only);
 * campus operators get their own tools plus the finance or academic set only while that seat is vacant on the
 * campus; the principal gets the academic set. Every other role executes nothing.
 */
export function schoolAiOperationsFor(role: string, seats: { academicLead: boolean; financeDesk: boolean }): Set<SchoolAiToolOperation> {
  if (role === "PRINCIPAL") return new Set(PRINCIPAL_TOOLS);
  if (role === "CAMPUS_ADMIN" || role === "ADMIN") {
    return new Set([...OPERATOR_TOOLS, ...(seats.financeDesk ? FINANCE_TOOLS : []), ...(seats.academicLead ? ACADEMIC_TOOLS : [])]);
  }
  return new Set();
}

/**
 * The allow-list for this user on this campus. Used by BOTH `getWorkspaceCapabilities` (what the UI offers)
 * and `authorize()` in ./execution (the single choke point for the execute route and queued runs), so typing a
 * request changes nothing. Server-only imports are dynamic to keep this module unit-testable.
 */
export async function allowedSchoolAiOperations(user: AuthUser, campusId: string | null): Promise<Set<SchoolAiToolOperation>> {
  if (user.role !== "CAMPUS_ADMIN" && user.role !== "ADMIN") return schoolAiOperationsFor(user.role, { academicLead: user.role === "PRINCIPAL", financeDesk: false });
  const { getCampusSeats } = await import("@/lib/auth/seats");
  const seats = await getCampusSeats(user.schoolId, campusId ?? user.campusId);
  return schoolAiOperationsFor(user.role, { academicLead: !seats.principal, financeDesk: !seats.accountant });
}

/**
 * Workers never hand-build an `AuthUser` (the institution kind would be missing, C32). They re-resolve the
 * stored actor through `resolveCurrentPrincipal` in its identity form (no MFA re-check) and refuse when the
 * account's role or access version no longer matches what was approved; the caller then marks the run or
 * job BLOCKED/ACCESS_CHANGED.
 */
export async function resolveWorkerPrincipal(stored: { userId: string; schoolId: string; role: string; accessVersion: number | null | undefined }): Promise<AuthUser | null> {
  const { resolveCurrentPrincipal } = await import("@/lib/auth/principal");
  const resolved = await resolveCurrentPrincipal({ userId: stored.userId, schoolId: stored.schoolId });
  if (!resolved || resolved.role !== stored.role) return null;
  if ((resolved.accessVersion ?? 0) !== (stored.accessVersion ?? 0)) return null;
  return resolved;
}
/** Authoring and execution must honor a revoked grant immediately, not after the shared UI cache expires. */
export async function loadWorkspacePermissionSnapshot(user: AuthUser, client?: TxClient): Promise<WorkspacePermissionSnapshot> {
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  const { PERMISSION_MODULES, moduleFlags } = await import("@/lib/permissions");
  const rows = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true, updatedAt: true } });
  // §7.4: `updatedAt` tells a seeded V1 default (follows the V2 default) from a grant saved after the cut-over (honoured).
  return new Map(PERMISSION_MODULES.map(module => [module, moduleFlags(rows, user.role, module)]));
}
export async function assertWorkspacePermission(user: AuthUser, module: PermissionModule, action: PermissionAction, permissions?: WorkspacePermissionSnapshot) {
  if (user.role === "SUPER_ADMIN") return;
  const snapshot = permissions ?? await loadWorkspacePermissionSnapshot(user);
  const flag = { view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action] as keyof PermissionFlags;
  if (!snapshot.get(module)?.[flag]) throw new SchoolAiError(`Insufficient permissions: ${module}.${action}.`, 403, "PERMISSION_DENIED");
}
export async function assertSchoolAiAccess(user: AuthUser, action: PermissionAction = "view", permissions?: WorkspacePermissionSnapshot) {
  assertSchoolAiRole(user);
  await assertWorkspacePermission(user, "ai", action, permissions);
}
export async function requireSchoolAiUser(action: PermissionAction = "view"): Promise<AuthUser> {
  const { requireAuthUser } = await import("@/lib/api/scope");
  const user = await requireAuthUser(); // Session revocation, live membership and subscription checks.
  await assertSchoolAiAccess(user, action);
  return user;
}

export interface WorkspaceAccessRecord {
  id: string;
  schoolId: string;
  campusId: string | null;
  kind: string;
  status: string;
  createdById: string;
  subjectId: string | null;
  classId: string | null;
}
export interface AssignedSubject { id: string; classId: string; campusId: string }

/** This pure boundary is also enforced after loading a record, never only by UI filtering. */
export function canAccessWorkspaceRecord(user: AuthUser, record: WorkspaceAccessRecord, mode: "read" | "write", subjects: readonly AssignedSubject[] = []): boolean {
  if (!(SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role) || record.schoolId !== user.schoolId) return false;
  if (user.role !== "SUPER_ADMIN" && (!user.campusId || record.campusId !== user.campusId)) return false;
  if (!allowedWorkspaceKinds(user).includes(record.kind as WorkspaceKind)) return false;
  if (isSchoolAiManager(user)) return true;
  if (user.role === "TEACHER") {
    const assigned = subjects.some((subject) => subject.id === record.subjectId && subject.classId === record.classId && subject.campusId === record.campusId);
    if (!assigned) return false;
    if (record.createdById === user.userId) return true;
    return mode === "read" && record.status === "APPROVED" && ["SOURCE", "CURRICULUM"].includes(record.kind);
  }
  return record.createdById === user.userId;
}
export function assertApprovalRole(user: AuthUser) {
  if (!isSchoolAiManager(user)) throw new SchoolAiError("Only an authorized school administrator or principal can approve this saved version.", 403);
}

/** The authoring side of the version under approval. Both ids are columns on `SchoolAiRecord`. */
export interface ApprovalSeparationRecord { createdById: string; updatedById: string }
const DELIVERY_POLICY_SOURCE_LABEL: Readonly<Record<DeliveryPolicySource, string>> = Object.freeze({
  SCHOOL_POLICY: "The school's approved delivery policy",
  PLATFORM_DEFAULT: "The platform default delivery policy",
});

/**
 * R2.4, which `assertApprovalRole` deliberately does not cover: R2.3 asks *whether this actor may
 * approve at all*, R2.4 asks *whether this actor may approve this version*. The two are separate
 * questions, so they stay separate functions and `assertApprovalRole` keeps its signature.
 *
 * The decision itself is `approvalSeparationDecision` in `./delivery-policy` — pure, and carrying
 * the policy source that produced it so the approval surface can state whether the school's policy
 * or the platform default applied. The platform default sets `separationOfDuties: "NOT_REQUIRED"`,
 * so a school that has configured no Delivery_Policy degrades to always-allow rather than silently
 * blocking every approval.
 *
 * **Both authoring actors are checked, which is stricter than the letter of R2.4.** The criterion
 * names "a version that Academic_Approver authored"; the version under approval was written by
 * `updatedById` and descends from content created by `createdById`. An approver who authored either
 * end has authored the material, so separation would not hold if only the last writer were checked:
 * a manager could create the content, hand the record to a colleague for one save, and approve it.
 */
export function approvalSeparation(user: Pick<AuthUser, "userId">, record: ApprovalSeparationRecord, policy: ResolvedDeliveryPolicy): ApprovalSeparationDecision {
  const decisions = [record.createdById, record.updatedById].map((authorId) => approvalSeparationDecision({ resolved: policy, authorId, approverId: user.userId }));
  // A refusal from either authoring actor decides; otherwise both agree and either one is the answer.
  return decisions.find((decision) => !decision.allowed) ?? decisions[0];
}

/** The thin throwing wrapper, called beside `assertApprovalRole`. Returns the decision so the caller can record which policy source applied. */
export function assertApprovalSeparation(user: AuthUser, record: ApprovalSeparationRecord, policy: ResolvedDeliveryPolicy): ApprovalSeparationDecision {
  const decision = approvalSeparation(user, record, policy);
  if (!decision.allowed) {
    throw new SchoolAiError(
      `${DELIVERY_POLICY_SOURCE_LABEL[decision.source]} requires that the actor who approves a saved version is not the actor who authored it. Ask another authorized approver to review this version.`,
      403,
      "APPROVAL_SEPARATION_REQUIRED",
    );
  }
  return decision;
}

export async function resolveWorkspaceCampus(user: AuthUser, requestedCampusId?: string | null, client?: TxClient): Promise<string | null> {
  assertSchoolAiRole(user);
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  const campusId = user.role === "SUPER_ADMIN" ? requestedCampusId ?? null : user.campusId;
  if (user.role !== "SUPER_ADMIN" && requestedCampusId !== undefined && requestedCampusId !== campusId) throw new SchoolAiError("Choose your assigned campus.", 403);
  if (campusId) {
    const campus = await db.campus.findFirst({ where: { id: campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } });
    if (!campus) throw new SchoolAiError("Campus is unavailable in your school.", 403);
  }
  return campusId;
}

export async function getAssignedWorkspaceSubjects(user: AuthUser, client?: TxClient) {
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  return db.subject.findMany({
    where: { schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}), ...(user.role === "TEACHER" ? { teacherId: user.userId } : {}), class: { status: "ACTIVE" } },
    select: { id: true, name: true, classId: true, campusId: true, class: { select: { name: true, section: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 2000,
  });
}

export async function assertWorkspaceSubject(user: AuthUser, campusId: string | null, data: Record<string, unknown>, client?: TxClient) {
  const subjectId = typeof data.subjectId === "string" && data.subjectId ? data.subjectId : null;
  const classId = typeof data.classId === "string" && data.classId ? data.classId : null;
  if (user.role === "TEACHER" && (!subjectId || !classId)) throw new SchoolAiError("Choose one of your assigned subjects and classes before saving.", 403);
  if (!subjectId && !classId) return { subjectId: null, classId: null };
  if (!subjectId || !classId || !campusId) throw new SchoolAiError("A subject requires its class and campus.", 400);
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  const subject = await db.subject.findFirst({
    where: { id: subjectId, schoolId: user.schoolId, campusId, classId, ...(user.role === "TEACHER" ? { teacherId: user.userId } : {}), class: { status: "ACTIVE" } },
    select: { id: true },
  });
  if (!subject) throw new SchoolAiError("This subject and class are outside your current teaching access.", 403);
  return { subjectId, classId };
}

const workflowPermissions: Record<string, PermissionModule> = {
  academics: "exams", curriculum: "exams", assessment: "exams", finance: "fees", communications: "ai",
  students: "students", fees: "fees", payroll: "payroll", leave: "leave", attendance: "attendance", timetable: "timetable", exams: "exams", reports: "reports", staff: "staff", admissions: "admissions", accounts: "accounts", ai: "ai", library: "library", "front-desk": "front-desk", transport: "transport", inventory: "inventory", dormitory: "dormitory",
};
export async function assertWorkspaceDomainPermission(user: AuthUser, kind: WorkspaceKind, data: Record<string, unknown>, action: "view" | "add" | "edit", permissions?: WorkspacePermissionSnapshot) {
  const assertPermission = (actor: AuthUser, module: PermissionModule, required: PermissionAction) => assertWorkspacePermission(actor, module, required, permissions);
  if (!allowedWorkspaceKinds(user).includes(kind)) throw new SchoolAiError("This workspace type is outside your role.", 403);
  if (EXAM_DOMAIN_WORKSPACE_KINDS.includes(kind)) await assertPermission(user, "exams", action);
  if (kind === "SOURCE") {
    const sourceModules: Record<string, PermissionModule> = { fee_sheet: "fees", register: "students", staff_list: "staff", timetable: "timetable", paper: "exams", answer_script: "exams", syllabus: "exams" };
    const permissionModule = sourceModules[String(data.documentKind)];
    if (permissionModule) await assertPermission(user, permissionModule, "view");
  }
  if (kind === "POLICY" && data.scope === "finance") await assertPermission(user, "fees", action);
  if (kind === "WORKFLOW") {
    if (data.proposal) {
      assertApprovalRole(user);
      const operation = (data.proposal as { operation?: string }).operation;
      if(operation === "operations.record_risk_decision") {
        const indicator=riskIndicatorSchema.parse((data.proposal as {indicator?:unknown}).indicator); for(const moduleName of riskModules(indicator))await assertPermission(user,moduleName,"view");
      } else if (operation === "setup.apply_changes") {
        for (const moduleName of ["timetable", "staff", "students"] as const) { await assertPermission(user,moduleName,"view"); if (action!=="view") await assertPermission(user,moduleName,moduleName==="students"?"edit":"add"); }
        const setup = data.proposal as { action?: string; rows?: Array<{ calendarAction?: string }> };
        if (setup.action === "SUBJECTS" || setup.action === "TEACHER_ALLOCATIONS") { await assertPermission(user, "exams", "view"); if (action !== "view") await assertPermission(user, "exams", setup.action === "SUBJECTS" ? "add" : "edit"); }
        if (action !== "view" && ["TEACHER_ALLOCATIONS", "HOLIDAYS", "WEEKENDS"].includes(setup.action ?? "")) await assertPermission(user, "timetable", "edit");
        if (action !== "view" && setup.action === "HOLIDAYS" && setup.rows?.some(row => row.calendarAction === "DELETE")) await assertPermission(user, "timetable", "delete");
        if (setup.action === "MIGRATION_CUTOVER") {
          await assertPermission(user, "fees", "view"); await assertPermission(user, "accounts", "view");
          if (action !== "view") { await assertPermission(user, "fees", "add"); await assertPermission(user, "fees", "edit"); await assertPermission(user, "accounts", "add"); }
        }
      } else if (operation === "academics.transition_year" || operation === "students.promote_enrollment") {
        const permissionModule = operation === "academics.transition_year" ? "exams" : "students";
        await assertPermission(user, permissionModule, "view"); if (action !== "view") await assertPermission(user, permissionModule, "edit");
      } else if (operation === "finance.apply_operation") {
        await assertPermission(user, "fees", "view"); await assertPermission(user, "accounts", "view");
        if (action !== "view") { await assertPermission(user, "fees", "add"); await assertPermission(user, "fees", "edit"); await assertPermission(user, "accounts", "add"); }
      } else if (operation === "attendance.record_register") {
        await assertPermission(user, "attendance", "view"); await assertPermission(user, "students", "view"); if (action !== "view") await assertPermission(user, "attendance", "add");
      } else if (operation === "timetable.publish_reviewed" || operation === "timetable.create_school_drafts" || operation === "timetable.assign_substitutes") {
        await assertPermission(user, "timetable", "view"); if (action !== "view") await assertPermission(user, "timetable", operation === "timetable.assign_substitutes" || operation === "timetable.publish_reviewed" ? "edit" : "add");
      } else if ((data.proposal as { operation?: string }).operation === "fees.generate_invoices") {
        await assertPermission(user, "fees", "view");
        if (action !== "view") await assertPermission(user, "fees", "add");
      } else if ((data.proposal as { operation?: string }).operation === "exams.create_session_plan") {
        await assertPermission(user, "exams", "view");
        await assertPermission(user, "students", "view");
        if (action !== "view") { await assertPermission(user, "exams", "add"); await assertPermission(user, "exams", "edit"); }
      } else if ((data.proposal as { operation?: string }).operation === "communications.queue_announcement") {
        await assertPermission(user, "students", "view");
        if (action !== "view") await assertPermission(user, "students", "edit");
      } else if ((data.proposal as { operation?: string }).operation === "timetable.create_draft") {
        await assertPermission(user, "timetable", "view");
        if (action !== "view") await assertPermission(user, "timetable", "add");
      } else {
        await assertPermission(user, "exams", action === "view" ? "view" : "edit");
        await assertPermission(user, "students", action === "view" ? "view" : "add");
      }
    }
    const steps = Array.isArray(data.steps) ? data.steps as Array<{ module?: string }> : [];
    for (const step of steps) {
      if ((!step.module || step.module === "school") && !isSchoolAiManager(user)) throw new SchoolAiError("Choose a permitted operational module for each workflow step.", 403);
      const permissionModule = step.module ? workflowPermissions[step.module] : undefined;
      if (permissionModule) await assertPermission(user, permissionModule, "view");
    }
  }
}

/** `setupTasks`: whether the "Setup tasks" tab (delegating and accepting setup facts) is offered — only the
 *  institution authority or the named readiness lead (G42, §10.8). Assignees answer through /setup/readiness. */
export type WorkspaceCapabilitiesWithSetup = WorkspaceCapabilities & { setupTasks: boolean };

/** Same rule as the setup-task service's manager gate, shared so the tab and the API agree. */
export async function canManageSetupTasks(user: AuthUser, client?: TxClient): Promise<boolean> {
  const { isInstitutionAuthority } = await import("@/lib/auth/institution");
  if (isInstitutionAuthority(user)) return true;
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  const { isReadinessLead } = await import("@/lib/readiness/service");
  return isReadinessLead(db, user);
}

export async function getWorkspaceCapabilities(user: AuthUser): Promise<WorkspaceCapabilitiesWithSetup> {
  await assertSchoolAiAccess(user, "view");
  const { prisma } = await import("@/lib/db/prisma");
  const [allowed, setupTasks] = await Promise.all([allowedSchoolAiOperations(user, user.campusId), canManageSetupTasks(user)]);
  const campusScope = user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {};
  const [permissions, campuses, subjects, school, classes, cycles] = await Promise.all([
    loadWorkspacePermissionSnapshot(user),
    prisma.campus.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(user.role !== "SUPER_ADMIN" ? { id: user.campusId ?? "" } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 }),
    isSchoolAiManager(user) || user.role === "TEACHER" ? getAssignedWorkspaceSubjects(user) : Promise.resolve([]),
    prisma.school.findUnique({ where: { id: user.schoolId }, select: { name: true, timezone: true } }),
    isSchoolAiManager(user) ? prisma.class.findMany({ where: { schoolId: user.schoolId, ...campusScope, status: "ACTIVE", archivedAt: null }, select: { name: true }, distinct: ["name"], take: 200 }) : Promise.resolve([]),
    isSchoolAiManager(user) ? prisma.academicCycle.findMany({ where: { schoolId: user.schoolId, ...campusScope, status: "ACTIVE" }, select: { academicYear: true, startDate: true, endDate: true }, take: 100 }) : Promise.resolve([]),
  ]);
  const fixed = user.role === "SUPER_ADMIN";
  const ai = permissions.get("ai");
  const exam = permissions.get("exams");
  const years = [...new Set(cycles.map((cycle) => String(cycle.academicYear)))];
  const profile = { schoolName: school?.name ?? "", timezone: school?.timezone ?? "", campuses: campuses.map((campus) => campus.name).join(", "), ...(classes.length ? { grades: classes.map((cls) => cls.name).join(", ") } : {}), ...(years.length === 1 ? { academicYear: years[0] } : {}) };
  const sameDate = (field: "startDate" | "endDate") => {
    const dates = cycles.map((cycle) => cycle[field]?.toISOString().slice(0, 10));
    return dates.length && dates.every((value) => value && value === dates[0]) ? dates[0] : undefined;
  };
  const startDate = sameDate("startDate"), endDate = sameDate("endDate");
  const canExecute = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && exam?.canEdit));
  const students = permissions.get("students");
  const canSetupYear = canExecute && (fixed || Boolean(students?.canAdd && students?.canView));
  const timetable = permissions.get("timetable");
  const canSetupTimetable = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && timetable?.canView && timetable?.canAdd));
  const canQueueAnnouncement = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && students?.canView && students?.canEdit));
  // Decoupled from announcements (G42): promotion is its own campus-operations tool.
  const canPromote = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && students?.canView && students?.canEdit));
  const fees = permissions.get("fees");
  const canGenerateInvoices = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && fees?.canView && fees?.canAdd));
  const canPlanExams = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && exam?.canView && exam?.canAdd && exam?.canEdit && students?.canView));
  const accounts = permissions.get("accounts"), attendance = permissions.get("attendance");
  const staff = permissions.get("staff");
  const canReviewRisks = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && (attendance?.canView && students?.canView || timetable?.canView && permissions.get("leave")?.canView || exam?.canView && permissions.get("reports")?.canView)));
  const canSchoolSetup = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && timetable?.canView && timetable?.canAdd && staff?.canView && staff?.canAdd && students?.canView && students?.canEdit));
  const canFinance = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && fees?.canView && fees?.canAdd && fees?.canEdit && accounts?.canView && accounts?.canAdd));
  const canAttendance = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && attendance?.canView && attendance?.canAdd && students?.canView));
  const canSubstitutes = isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit && timetable?.canView && timetable?.canEdit));
  // G42: the matrix flags above say what the role's permissions allow; the seat allow-list says which tools
  // this role may run at all. A tool is offered only when both agree (the same intersection authorize() applies).
  const tools: NonNullable<WorkspaceCapabilities["tools"]> = [...(canSubstitutes ? [{ operation: "timetable.publish_reviewed" as const,kind:"WORKFLOW" as const }] : []),...(canReviewRisks ? [{operation:"operations.record_risk_decision" as const,kind:"WORKFLOW" as const}] : []),...(canSchoolSetup ? [{ operation: "setup.apply_changes" as const, kind: "WORKFLOW" as const }] : []), ...(canExecute ? [{ operation: "academics.transition_year" as const, kind: "WORKFLOW" as const }] : []), ...(canPromote ? [{ operation: "students.promote_enrollment" as const, kind: "WORKFLOW" as const }] : []), ...(canFinance ? [{ operation: "finance.apply_operation" as const, kind: "WORKFLOW" as const }] : []), ...(canAttendance ? [{ operation: "attendance.record_register" as const, kind: "WORKFLOW" as const }] : []), ...(canSubstitutes ? [{ operation: "timetable.assign_substitutes" as const, kind: "WORKFLOW" as const }] : []), ...(canSetupTimetable ? [{ operation: "timetable.create_school_drafts" as const, kind: "WORKFLOW" as const }] : []), ...(canGenerateInvoices ? [{ operation: "fees.generate_invoices" as const, kind: "WORKFLOW" as const }] : []), ...(canPlanExams ? [{ operation: "exams.create_session_plan" as const, kind: "WORKFLOW" as const }] : []), ...(canExecute ? [{ operation: "curriculum.import_topics" as const, kind: "CURRICULUM" as const }] : []), ...(canSetupYear ? [{ operation: "academics.setup_year" as const, kind: "WORKFLOW" as const }] : []), ...(canSetupTimetable ? [{ operation: "timetable.create_draft" as const, kind: "WORKFLOW" as const }] : []), ...(canQueueAnnouncement ? [{ operation: "communications.queue_announcement" as const, kind: "WORKFLOW" as const }] : [])]
    .filter((tool) => allowed.has(tool.operation));
  return {
    role: user.role, campusId: user.campusId,
    canCreate: fixed || Boolean(ai?.canAdd),
    canApprove: isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit)),
    canArchive: fixed || Boolean(ai?.canDelete),
    canImportRoster: isSchoolAiManager(user) && (fixed || Boolean(ai?.canView && ai?.canAdd && students?.canView && students?.canAdd)),
    kinds: allowedWorkspaceKinds(user).filter((kind) => !EXAM_DOMAIN_WORKSPACE_KINDS.includes(kind) || fixed || exam?.canView),
    campuses,
    subjects: subjects.map(({ class: cls, ...subject }) => ({ ...subject, className: [cls.name, cls.section].filter(Boolean).join(" · ") })),
    profile,
    setupDefaults: { ...profile, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
    execution: tools.length ? "EXPLICIT_TOOLS_ONLY" : "DRAFTS_ONLY",
    tools,
    setupTasks,
  };
}

export function isWorkspaceStatus(value: string): value is WorkspaceStatus {
  return ["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"].includes(value);
}

/** Enforce the bound while streaming, including requests without a Content-Length header. */
export async function readSchoolAiJson(request: Request, maxBytes = 512 * 1024): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new SchoolAiError("The school AI request is too large.", 413);
  if (!request.body) throw new SchoolAiError("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new SchoolAiError("The school AI request is too large.", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof SchoolAiError) throw error;
    throw new SchoolAiError("Enter a valid JSON request body.");
  } finally { reader.releaseLock(); }
}
