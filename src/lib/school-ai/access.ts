import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import type { PermissionAction, PermissionModule, PermissionFlags } from "@/lib/permissions";
import type { WorkspaceCapabilities, WorkspaceKind, WorkspaceStatus } from "./types";

export class SchoolAiError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); this.name = "SchoolAiError"; }
}
export const SCHOOL_AI_STAFF_ROLES = ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
export function isSchoolAiManager(user: Pick<AuthUser, "role">) {
  return ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(user.role);
}
export function allowedWorkspaceKinds(user: Pick<AuthUser, "role">): WorkspaceKind[] {
  if (isSchoolAiManager(user)) return ["ONBOARDING", "SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "POLICY"];
  if (user.role === "TEACHER") return ["SOURCE", "CURRICULUM", "PAPER", "WORKFLOW"];
  if ((SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role)) return ["SOURCE", "WORKFLOW"];
  return [];
}
export function assertSchoolAiRole(user: AuthUser) {
  if (!user.schoolId || !(SCHOOL_AI_STAFF_ROLES as readonly string[]).includes(user.role)) throw new SchoolAiError("The school AI workspace is available to authorized school staff only.", 403);
  if (user.role !== "SUPER_ADMIN" && !user.campusId) throw new SchoolAiError("An active campus assignment is required.", 403);
}
export type WorkspacePermissionSnapshot = ReadonlyMap<string, PermissionFlags>;
/** Authoring and execution must honor a revoked grant immediately, not after the shared UI cache expires. */
export async function loadWorkspacePermissionSnapshot(user: AuthUser, client?: TxClient): Promise<WorkspacePermissionSnapshot> {
  const db = client ?? (await import("@/lib/db/prisma")).prisma;
  const { PERMISSION_MODULES, moduleFlags } = await import("@/lib/permissions");
  const rows = await db.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true } });
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
  if (kind === "CURRICULUM" || kind === "PAPER") await assertPermission(user, "exams", action);
  if (kind === "SOURCE") {
    const sourceModules: Record<string, PermissionModule> = { fee_sheet: "fees", register: "students", staff_list: "staff", timetable: "timetable", paper: "exams", answer_script: "exams", syllabus: "exams" };
    const permissionModule = sourceModules[String(data.documentKind)];
    if (permissionModule) await assertPermission(user, permissionModule, "view");
  }
  if (kind === "POLICY" && data.scope === "finance") await assertPermission(user, "fees", action);
  if (kind === "WORKFLOW") {
    if (data.proposal) {
      assertApprovalRole(user);
      if ((data.proposal as { operation?: string }).operation === "communications.queue_announcement") {
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

export async function getWorkspaceCapabilities(user: AuthUser): Promise<WorkspaceCapabilities> {
  await assertSchoolAiAccess(user, "view");
  const { prisma } = await import("@/lib/db/prisma");
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
  return {
    role: user.role, campusId: user.campusId,
    canCreate: fixed || Boolean(ai?.canAdd),
    canApprove: isSchoolAiManager(user) && (fixed || Boolean(ai?.canEdit)),
    canArchive: fixed || Boolean(ai?.canDelete),
    canImportRoster: isSchoolAiManager(user) && (fixed || Boolean(ai?.canView && ai?.canAdd && students?.canView && students?.canAdd)),
    kinds: allowedWorkspaceKinds(user).filter((kind) => !["CURRICULUM", "PAPER"].includes(kind) || fixed || exam?.canView),
    campuses,
    subjects: subjects.map(({ class: cls, ...subject }) => ({ ...subject, className: [cls.name, cls.section].filter(Boolean).join(" · ") })),
    profile,
    setupDefaults: { ...profile, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
    execution: canExecute || canSetupTimetable || canQueueAnnouncement ? "EXPLICIT_TOOLS_ONLY" : "DRAFTS_ONLY",
    tools: [...(canExecute ? [{ operation: "curriculum.import_topics" as const, kind: "CURRICULUM" as const }] : []), ...(canSetupYear ? [{ operation: "academics.setup_year" as const, kind: "WORKFLOW" as const }] : []), ...(canSetupTimetable ? [{ operation: "timetable.create_draft" as const, kind: "WORKFLOW" as const }] : []), ...(canQueueAnnouncement ? [{ operation: "communications.queue_announcement" as const, kind: "WORKFLOW" as const }] : [])],
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
