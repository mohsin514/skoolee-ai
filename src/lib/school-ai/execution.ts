import { assertSchoolSetupRecordAccess, assertSchoolSetupAccess, previewSchoolSetup, applySchoolSetup } from "./school-setup-service";
import type { SchoolSetupPreview, SchoolSetupResult, SchoolSetupExecutionReceipt } from "./school-setup";
import { SCHOOL_AI_OPERATION_NAMES } from "./operations";
import { assertSchoolOperationsAccess, lockSchoolOperations, previewSchoolOperations, applySchoolOperations } from "./school-operations-service";
import { isSchoolOperationsOperation, type SchoolOperationsPreview, type SchoolOperationsReceipt, type SchoolOperationsResult } from "./school-operations";
import { assertFinanceOperationsAccess, previewFinanceOperations, applyFinanceOperations } from "./finance-operations-service";
import type { FinanceOperationsPreview, FinanceOperationsResult, FinanceOperationsExecutionReceipt } from "./finance-operations";
import { Prisma, type SchoolAiExecution, type SchoolAiRecord } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { schoolAiTransaction as transaction } from "./transaction";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { allowedSchoolAiOperations, assertApprovalRole, assertSchoolAiAccess, assertWorkspaceDomainPermission, assertWorkspaceSubject, loadWorkspacePermissionSnapshot, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema, validateCurriculumApproval, type CurriculumData } from "./assessment";
import { workspaceRequestHash } from "./repository";
import { applyAcademicSetup, previewAcademicSetup } from "./academic-setup-service";
import type { AcademicSetupExecutionReceipt, AcademicSetupPreview } from "./academic-setup";
import { applyTimetableSetup, previewTimetableSetup } from "./timetable-setup-service";
import type { TimetableSetupExecutionReceipt, TimetableSetupPreview } from "./timetable-setup";
import { assertAnnouncementAccess, buildAnnouncementPreview, queueAnnouncement } from "./announcements-service";
import type { AnnouncementExecutionReceipt, AnnouncementPreview } from "./announcements";
import { assertFeeInvoiceAccess, previewFeeInvoices, applyFeeInvoices } from "./fee-invoices-service";
import type { FeeInvoicePreview, FeeInvoiceResult, FeeInvoiceExecutionReceipt } from "./fee-invoices";
import { lockInvoiceGeneration } from "@/lib/fees/invoice-generation";
import { assertExamSessionPlanAccess, previewExamSessionPlan, applyExamSessionPlan } from "./exam-session-plan-service";
import type { ExamSessionPlanPreview, ExamSessionPlanExecutionReceipt } from "./exam-session-plan";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { assertTimetableWriteAccess } from "@/lib/timetable/manual";

/** New executors must register a typed operation here; generated prose is never executable. */
export const SCHOOL_AI_TOOLS = {
  "timetable.publish_reviewed": {kind:"WORKFLOW",permission:"timetable.view+edit",requiresApprovedVersion:true,effect:"Publish exactly reviewed draft timetables after current complete validation."},
  "operations.record_risk_decision": {kind:"WORKFLOW",permission:"indicator-specific current domain view",requiresApprovedVersion:true,effect:"Record a reviewed evidence-based decision with an accountable owner and due date."},
  "setup.apply_changes": { kind: "WORKFLOW", permission: "timetable.view+add,staff.view+add,students.view+edit", requiresApprovedVersion: true, effect: "Create exactly reviewed resources, pending staff invitations or unverified guardian relationships." },
  "academics.transition_year": { kind: "WORKFLOW", permission: "exams.view+edit", requiresApprovedVersion: true, effect: "Apply the reviewed academic-year lifecycle transition with current closure checks." },
  "students.promote_enrollment": { kind: "WORKFLOW", permission: "students.view+edit", requiresApprovedVersion: true, effect: "Promote exactly selected pupils to the reviewed next-year class while preserving history." },
  "finance.apply_operation": { kind: "WORKFLOW", permission: "fees.view+add+edit,accounts.view+add", requiresApprovedVersion: true, effect: "Apply the exact reviewed financial operation with existing accounting invariants." },
  "timetable.create_school_drafts": { kind: "WORKFLOW", permission: "timetable.view+add", requiresApprovedVersion: true, effect: "Create the reviewed school-wide timetable drafts atomically." },
  "attendance.record_register": { kind: "WORKFLOW", permission: "attendance.view+add,students.view", requiresApprovedVersion: true, effect: "Save explicitly observed and reviewed attendance." },
  "timetable.assign_substitutes": { kind: "WORKFLOW", permission: "timetable.view+edit", requiresApprovedVersion: true, effect: "Reserve reviewed substitute lesson duties." },
  "fees.generate_invoices": { kind: "WORKFLOW", permission: "fees.view+add", requiresApprovedVersion: true, effect: "Create exactly reviewed fee invoices; preserve payments and ledger postings." },
  "exams.create_session_plan": { kind: "WORKFLOW", permission: "exams.view+add+edit,students.view", requiresApprovedVersion: true, effect: "Create a draft exam session, datesheet, seating and invigilator duties." },
  "curriculum.import_topics": { kind: "CURRICULUM", permission: "exams.edit", requiresApprovedVersion: true, effect: "Append missing subject syllabus topics; preserve existing topics." },
  "academics.setup_year": { kind: "WORKFLOW", permission: "students.add+exams.edit", requiresApprovedVersion: true, effect: "Create a draft academic cycle and missing classes; preserve existing academic records." },
  "timetable.create_draft": { kind: "WORKFLOW", permission: "timetable.view+add", requiresApprovedVersion: true, effect: "Create one reviewed draft timetable with current references and clash checks; preserve existing schedules." },
  "communications.queue_announcement": { kind: "WORKFLOW", permission: "students.view+edit", requiresApprovedVersion: true, effect: "Queue exact reviewed guardian email text and audience; reauthorize every recipient before delivery." },
} as const;
export type SchoolAiOperation = keyof typeof SCHOOL_AI_TOOLS;
export const executionOperationSchema = z.enum(SCHOOL_AI_OPERATION_NAMES);
export const executionInputSchema = z.strictObject({
  operation: executionOperationSchema,
  version: z.number().int().positive(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/),
});
export type SchoolAiExecutionInput = z.infer<typeof executionInputSchema>;
type Topic = { id: string; title: string; description: string | null; order: number; status: string; updatedAt: Date };
export interface CurriculumImportPreview {
  operation: "curriculum.import_topics";
  recordId: string;
  version: number;
  campusId: string;
  subjectId: string;
  classId: string;
  willCreate: Array<{ outcomeId: string; title: string; sourceTitle: string; reference: string; description: string }>;
  willKeep: Array<{ outcomeId: string; topicId: string; title: string }>;
  previewHash: string;
}
export interface SchoolAiExecutionReceipt {
  id: string;
  operation: "curriculum.import_topics";
  recordId: string;
  version: number;
  status: "COMPLETED";
  createdCount: number;
  keptCount: number;
  topicIds: string[];
  completedAt: string;
}
export type AnySchoolAiExecutionReceipt = SchoolSetupExecutionReceipt | FinanceOperationsExecutionReceipt | SchoolOperationsReceipt | SchoolAiExecutionReceipt | AcademicSetupExecutionReceipt | TimetableSetupExecutionReceipt | AnnouncementExecutionReceipt | ExamSessionPlanExecutionReceipt | FeeInvoiceExecutionReceipt;
export type SchoolAiExecutionPreview = SchoolSetupPreview | FinanceOperationsPreview | SchoolOperationsPreview | CurriculumImportPreview | AcademicSetupPreview | TimetableSetupPreview | AnnouncementPreview | ExamSessionPlanPreview | FeeInvoicePreview;

const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
export function buildCurriculumImportPreview(record: { id: string; version: number; campusId: string }, curriculum: CurriculumData, existing: Topic[]): CurriculumImportPreview {
  const issues = validateCurriculumApproval(curriculum);
  if (issues.length) throw new SchoolAiError(issues.slice(0, 10).join(" "), 422);
  const outcomes = curriculum.outcomes.filter((outcome) => outcome.included);
  if (!outcomes.length) throw new SchoolAiError("There are no included curriculum outcomes to import.", 422);
  if (new Set(outcomes.map((outcome) => normalize(outcome.title))).size !== outcomes.length) throw new SchoolAiError("Disambiguate duplicate outcome titles before importing them as syllabus topics.", 422);
  const byTitle = new Map<string, Topic>();
  for (const topic of existing) if (!byTitle.has(normalize(topic.title))) byTitle.set(normalize(topic.title), topic);
  const willCreate: CurriculumImportPreview["willCreate"] = [];
  const willKeep: CurriculumImportPreview["willKeep"] = [];
  for (const outcome of outcomes) {
    const topic = byTitle.get(normalize(outcome.title));
    if (topic) willKeep.push({ outcomeId: outcome.id, topicId: topic.id, title: topic.title });
    else {
      const source = curriculum.sources.find((item) => item.id === outcome.sourceId)!;
      const reference = `${source.reference} · page ${outcome.sourcePage}`;
      willCreate.push({ outcomeId: outcome.id, title: outcome.title.trim(), sourceTitle: source.title, reference, description: `Curriculum source: ${source.title}\n${reference}\nApproved workspace ${record.id}, version ${record.version}; outcome ${outcome.id}.` });
    }
  }
  const preview = { operation: "curriculum.import_topics" as const, recordId: record.id, version: record.version, campusId: record.campusId, subjectId: curriculum.subjectId, classId: curriculum.classId, willCreate, willKeep };
  return { ...preview, previewHash: workspaceRequestHash({ preview, curriculum, existing: existing.map((topic) => ({ ...topic, updatedAt: topic.updatedAt.toISOString() })) }) };
}

/** G42: allow-list ∩ matrix. `allowed` is `allowedSchoolAiOperations(user, campusId)` — the per-role, per-seat
 *  list of tools this user may run at all; the permission matrix then decides the module grants. */
function hasToolPermission(permissions: WorkspacePermissionSnapshot, operation: SchoolAiOperation, allowed: ReadonlySet<string>) {
  if (!allowed.has(operation)) return false;
  return hasMatrixToolPermission(permissions, operation);
}
function hasMatrixToolPermission(permissions: WorkspacePermissionSnapshot, operation: SchoolAiOperation) {
  if (operation === "operations.record_risk_decision") return Boolean(permissions.get("attendance")?.canView && permissions.get("students")?.canView || permissions.get("timetable")?.canView && permissions.get("leave")?.canView || permissions.get("exams")?.canView && permissions.get("reports")?.canView);
  if (operation === "setup.apply_changes") return permissions.get("timetable")?.canView && permissions.get("timetable")?.canAdd && permissions.get("staff")?.canView && permissions.get("staff")?.canAdd && permissions.get("students")?.canView && permissions.get("students")?.canEdit;
  if (operation === "academics.transition_year") return permissions.get("exams")?.canView && permissions.get("exams")?.canEdit;
  if (operation === "students.promote_enrollment") return permissions.get("students")?.canView && permissions.get("students")?.canEdit;
  if (operation === "finance.apply_operation") return permissions.get("fees")?.canView && permissions.get("fees")?.canAdd && permissions.get("fees")?.canEdit && permissions.get("accounts")?.canView && permissions.get("accounts")?.canAdd;
  if (operation === "attendance.record_register") return permissions.get("attendance")?.canView && permissions.get("attendance")?.canAdd && permissions.get("students")?.canView;
  if (operation === "timetable.create_school_drafts") return permissions.get("timetable")?.canView && permissions.get("timetable")?.canAdd;
  if (operation === "timetable.assign_substitutes" || operation === "timetable.publish_reviewed") return permissions.get("timetable")?.canView && permissions.get("timetable")?.canEdit;
  if (operation === "fees.generate_invoices") return permissions.get("fees")?.canView && permissions.get("fees")?.canAdd;
  if (operation === "exams.create_session_plan") return permissions.get("exams")?.canView && permissions.get("exams")?.canAdd && permissions.get("exams")?.canEdit && permissions.get("students")?.canView;
  if (operation === "communications.queue_announcement") return permissions.get("students")?.canView && permissions.get("students")?.canEdit;
  return operation === "timetable.create_draft" ? permissions.get("timetable")?.canView && permissions.get("timetable")?.canAdd : permissions.get("exams")?.canEdit && permissions.get("exams")?.canView && (operation !== "academics.setup_year" || permissions.get("students")?.canView && permissions.get("students")?.canAdd);
}
/** Names who runs a tool the allow-list refused, in the words of the seat that owns it. */
function toolRefusal(role: string, operation: SchoolAiOperation) {
  if (role === "SUPER_ADMIN") return "Campus tools are run by each campus's own team.";
  if (operation === "finance.apply_operation" || operation === "fees.generate_invoices") return "Fee and finance tools belong to your finance desk.";
  if (role === "PRINCIPAL") return "This tool belongs to your campus admin.";
  return "Your principal runs this academic tool.";
}
/** The single choke point for the execute route, previews, listings and queued runs (G42 [K-B2]). */
async function authorize(user: AuthUser, operation: SchoolAiOperation = "curriculum.import_topics", snapshot?: WorkspacePermissionSnapshot, db?: TxClient) {
  assertApprovalRole(user); // Mirrors the existing syllabus management boundary.
  const permissions = snapshot ?? await loadWorkspacePermissionSnapshot(user);
  await assertSchoolAiAccess(user, "edit", permissions);
  const allowed = await allowedSchoolAiOperations(user, user.campusId);
  if (!allowed.has(operation)) throw new SchoolAiError(toolRefusal(user.role, operation), 403, "PERMISSION_DENIED");
  if (!hasToolPermission(permissions, operation, allowed)) throw new SchoolAiError("Your current permissions do not allow this operation.", 403, "PERMISSION_DENIED");
  await assertSchoolOperational(user.schoolId, db);
}
export async function assertSchoolAiOperationAccess(user: AuthUser, operation: SchoolAiOperation, db: TxClient) {
  await authorize(user, operation, await loadWorkspacePermissionSnapshot(user, db), db);
}
function withContext<T>(user: AuthUser, fn: () => Promise<T>) {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role, unscoped: false }, fn);
}
async function approvedRecord(user: AuthUser, id: string, operation: SchoolAiOperation, version: number, db: TxClient): Promise<SchoolAiRecord & { campusId: string }> {
  const record = await db.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  if (!record) throw new SchoolAiError("Workspace item not found in your campus.", 404, "WORKSPACE_NOT_FOUND");
  if (!record.campusId) throw new SchoolAiError("Choose a campus for this operation.", 400, "CAMPUS_REQUIRED");
  if (record.kind !== SCHOOL_AI_TOOLS[operation].kind) throw new SchoolAiError("This operation does not apply to this workspace item.", 400, "INVALID_OPERATION");
  if (record.status !== "APPROVED" || record.version !== version || !record.approvedById) throw new SchoolAiError("Review and approve the current saved version before applying its operation.", 409, "STALE_WORKSPACE_VERSION");
  return record as SchoolAiRecord & { campusId: string };
}
async function previewInTransaction(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient) {
  const curriculum = curriculumDataSchema.parse(record.data);
  await assertWorkspaceSubject(user, record.campusId, curriculum, db);
  const existing = await db.syllabusTopic.findMany({ where: { schoolId: user.schoolId, subjectId: curriculum.subjectId }, select: { id: true, title: true, description: true, order: true, status: true, updatedAt: true }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  return { preview: buildCurriculumImportPreview(record, curriculum, existing), existing };
}
function receipt(execution: SchoolAiExecution): AnySchoolAiExecutionReceipt {
  if (execution.operation === "setup.apply_changes") return { ...(execution.receipt as unknown as SchoolSetupResult), id: execution.id, operation: "setup.apply_changes", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", completedAt: execution.completedAt.toISOString() };
  if (execution.operation === "finance.apply_operation") return { ...(execution.receipt as unknown as FinanceOperationsResult), id: execution.id, operation: "finance.apply_operation", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", completedAt: execution.completedAt.toISOString() };
  if (isSchoolOperationsOperation(execution.operation)) return { ...(execution.receipt as unknown as SchoolOperationsResult), id: execution.id, operation: execution.operation, recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", completedAt: execution.completedAt.toISOString() };
  if (execution.operation === "fees.generate_invoices") return { ...(execution.receipt as unknown as FeeInvoiceResult), id: execution.id, operation: "fees.generate_invoices", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", completedAt: execution.completedAt.toISOString() };
  if (execution.operation === "exams.create_session_plan") {
    const value = execution.receipt as unknown as Pick<ExamSessionPlanExecutionReceipt, "sessionId" | "examIds" | "scheduleIds" | "seatCount" | "invigilationCount" | "sessionStatus" | "examStatus">;
    return { ...value, id: execution.id, operation: "exams.create_session_plan", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", completedAt: execution.completedAt.toISOString() };
  }
  if (execution.operation === "communications.queue_announcement") {
    const value = execution.receipt as unknown as Pick<AnnouncementExecutionReceipt, "queuedCount" | "communicationIds">;
    return { id: execution.id, operation: "communications.queue_announcement", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", ...value, completedAt: execution.completedAt.toISOString() };
  }
  if (execution.operation === "timetable.create_draft") {
    const value = execution.receipt as unknown as Pick<TimetableSetupExecutionReceipt, "timetableId" | "timetableStatus" | "slotCount" | "classId" | "academicYear" | "term">;
    return { id: execution.id, operation: "timetable.create_draft", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", ...value, completedAt: execution.completedAt.toISOString() };
  }
  if (execution.operation === "academics.setup_year") {
    const value = execution.receipt as unknown as Pick<AcademicSetupExecutionReceipt, "createdCount" | "keptCount" | "cycleId" | "cycleCreated" | "classIds">;
    return { id: execution.id, operation: "academics.setup_year", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", ...value, completedAt: execution.completedAt.toISOString() };
  }
  const value = execution.receipt as { createdCount: number; keptCount: number; topicIds: string[] };
  return { id: execution.id, operation: "curriculum.import_topics", recordId: execution.recordId, version: execution.recordVersion, status: "COMPLETED", ...value, completedAt: execution.completedAt.toISOString() };
}
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "curriculum.import_topics", version: number): Promise<CurriculumImportPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "academics.setup_year", version: number): Promise<AcademicSetupPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "timetable.create_draft", version: number): Promise<TimetableSetupPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "communications.queue_announcement", version: number): Promise<AnnouncementPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "exams.create_session_plan", version: number): Promise<ExamSessionPlanPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "fees.generate_invoices", version: number): Promise<FeeInvoicePreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "setup.apply_changes", version: number): Promise<SchoolSetupPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: "finance.apply_operation", version: number): Promise<FinanceOperationsPreview>;
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: SchoolAiOperation, version: number): Promise<SchoolAiExecutionPreview>;
export async function previewSchoolAiExecution(user: AuthUser, id: string, operation: SchoolAiOperation, version: number): Promise<SchoolAiExecutionPreview> {
  return withContext(user, async () => {
    if (!executionOperationSchema.safeParse(operation).success || !Number.isSafeInteger(version) || version < 1) throw new SchoolAiError("Choose a supported tool and saved version.", 400, "INVALID_OPERATION");
    await authorize(user, operation);
    return transaction(user, async (tx) => {
      const record = await approvedRecord(user, id, operation, version, tx);
      if (operation === "setup.apply_changes") { await assertSchoolSetupAccess(user, tx); return previewSchoolSetup(user, record, tx); }
      if (operation === "finance.apply_operation") { await assertFinanceOperationsAccess(user, tx); return previewFinanceOperations(user, record, tx); }
      if (isSchoolOperationsOperation(operation)) { await assertSchoolOperationsAccess(user, operation, tx, record.campusId); return previewSchoolOperations(user, record, tx); }
      if (operation === "fees.generate_invoices") { await assertFeeInvoiceAccess(user, tx); return previewFeeInvoices(user, record, tx); }
      if (operation === "exams.create_session_plan") { await assertExamSessionPlanAccess(user, tx, record.campusId); return previewExamSessionPlan(user, record, tx); }
      if (operation === "academics.setup_year") return previewAcademicSetup(user, record, tx);
      if (operation === "timetable.create_draft") return previewTimetableSetup(user, record, tx);
      if (operation === "communications.queue_announcement") { await assertAnnouncementAccess(user, tx); return (await buildAnnouncementPreview(user, record, tx)).preview; }
      return (await previewInTransaction(user, record, tx)).preview;
    });
  });
}

export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "curriculum.import_topics" }): Promise<SchoolAiExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "academics.setup_year" }): Promise<AcademicSetupExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "timetable.create_draft" }): Promise<TimetableSetupExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "communications.queue_announcement" }): Promise<AnnouncementExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "fees.generate_invoices" }): Promise<FeeInvoiceExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "exams.create_session_plan" }): Promise<ExamSessionPlanExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "setup.apply_changes" }): Promise<SchoolSetupExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput & { operation: "finance.apply_operation" }): Promise<FinanceOperationsExecutionReceipt>;
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput): Promise<AnySchoolAiExecutionReceipt>;
export async function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput): Promise<AnySchoolAiExecutionReceipt> {
  return executeSchoolAiToolInTransaction(user, id, rawInput);
}

/** Internal worker entry: an existing transaction makes cancellation and each effect atomic. */
export async function executeSchoolAiToolInTransaction(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput, existingTransaction?: TxClient): Promise<AnySchoolAiExecutionReceipt> {
  const work = async () => {
    const input = executionInputSchema.parse(rawInput);
    await authorize(user, input.operation, existingTransaction ? await loadWorkspacePermissionSnapshot(user, existingTransaction) : undefined, existingTransaction);
    const replay = async (db: TxClient) => {
      if (input.operation === "operations.record_risk_decision") { const revision=await db.schoolAiRevision.findFirst({where:{schoolId:user.schoolId,recordId:id,version:input.version},select:{data:true}}); if(!revision)throw new SchoolAiError("Reviewed decision not found.",404); await assertWorkspaceDomainPermission(user,"WORKFLOW",revision.data as Record<string,unknown>,"view",await loadWorkspacePermissionSnapshot(user,db)); }
      if (input.operation === "setup.apply_changes") await assertSchoolSetupRecordAccess(user,id,db,input.version);
      if (input.operation === "finance.apply_operation") await assertFinanceOperationsAccess(user, db);
      if (isSchoolOperationsOperation(input.operation)) { const target = await db.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { campusId: true } }); if (!target?.campusId) throw new SchoolAiError("Workspace item not found.", 404); await assertSchoolOperationsAccess(user, input.operation, db, target.campusId); }
      if (input.operation === "fees.generate_invoices") await assertFeeInvoiceAccess(user, db);
      if (input.operation === "exams.create_session_plan") {
        const target = await db.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { campusId: true } });
        if (!target?.campusId) throw new SchoolAiError("Workspace item not found in your campus.", 404);
        await assertExamSessionPlanAccess(user, db, target.campusId);
      }
      const keyed = await db.schoolAiExecution.findFirst({ where: { schoolId: user.schoolId, requestedById: user.userId, idempotencyKey: input.idempotencyKey } });
      if (keyed && (keyed.recordId !== id || keyed.recordVersion !== input.version || keyed.operation !== input.operation || keyed.previewHash !== input.previewHash)) throw new SchoolAiError("This execution key was already used for a different preview.", 409, "EXECUTION_KEY_CONFLICT");
      // The winning request binds its key. Other callers replay the one effect
      // for this approved version; their keys are not persisted as aliases.
      const previous = keyed ?? await db.schoolAiExecution.findFirst({ where: { schoolId: user.schoolId, recordId: id, recordVersion: input.version, operation: input.operation } });
      if (previous && user.role !== "SUPER_ADMIN" && previous.campusId !== user.campusId) throw new SchoolAiError("Execution not found in your campus.", 404);
      return previous ? receipt(previous) : null;
    };
    try {
      const previous = await replay(existingTransaction ?? prisma);
      if (previous) return previous;
      const perform = async (tx: TxClient) => {
        const completed = await replay(tx);
        if (completed) return completed;
        const record = await approvedRecord(user, id, input.operation, input.version, tx);
        if (input.operation === "setup.apply_changes") {
          await lockTimetableCampus(tx,user.schoolId,record.campusId); await assertSchoolSetupAccess(user,tx);
          const preview=await previewSchoolSetup(user,record,tx);
          if(preview.previewHash!==input.previewHash)throw new SchoolAiError("School information changed. Review a fresh preview.",409,"STALE_EXECUTION_PREVIEW");
          const result=await applySchoolSetup(user,record,preview,tx);
          const execution=await tx.schoolAiExecution.create({data:{schoolId:user.schoolId,campusId:record.campusId,recordId:record.id,recordVersion:record.version,operation:input.operation,previewHash:input.previewHash,requestedById:user.userId,idempotencyKey:input.idempotencyKey,receipt:JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue}});
          await tx.auditLog.create({data:{schoolId:user.schoolId,tableName:"school_ai_executions",recordId:execution.id,userId:user.userId,oldValue:Prisma.DbNull,newValue:{operation:input.operation,workspaceId:record.id,workspaceVersion:record.version}}});return receipt(execution);
        }
        if (input.operation === "finance.apply_operation" || isSchoolOperationsOperation(input.operation)) {
          await lockTimetableCampus(tx, user.schoolId, record.campusId);
          if (input.operation === "finance.apply_operation") await assertFinanceOperationsAccess(user, tx);
          else { await lockSchoolOperations(user, record.campusId, tx); await assertSchoolOperationsAccess(user, input.operation, tx, record.campusId); }
          const preview = input.operation === "finance.apply_operation" ? await previewFinanceOperations(user, record, tx) : await previewSchoolOperations(user, record, tx);
          if (preview.previewHash !== input.previewHash) throw new SchoolAiError("School information changed. Review a fresh exact preview.", 409, "STALE_EXECUTION_PREVIEW");
          const result = preview.operation === "finance.apply_operation" ? await applyFinanceOperations(user, record, preview, tx) : await applySchoolOperations(user, preview, tx);
          const execution = await tx.schoolAiExecution.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version, operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey, receipt: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, workspaceId: record.id, workspaceVersion: record.version } } });
          return receipt(execution);
        }
        if (input.operation === "fees.generate_invoices" || input.operation === "exams.create_session_plan") {
          const fees = input.operation === "fees.generate_invoices";
          if (fees) { await lockInvoiceGeneration(tx, user.schoolId, record.campusId); await assertFeeInvoiceAccess(user, tx); }
          else { await lockTimetableCampus(tx, user.schoolId, record.campusId); await assertExamSessionPlanAccess(user, tx, record.campusId); }
          const preview = fees ? await previewFeeInvoices(user, record, tx) : await previewExamSessionPlan(user, record, tx);
          if (preview.previewHash !== input.previewHash) throw new SchoolAiError("School information changed. Review a fresh exact preview before applying.", 409, "STALE_EXECUTION_PREVIEW");
          const result = preview.operation === "fees.generate_invoices" ? await applyFeeInvoices(user, preview, tx) : await applyExamSessionPlan(user, preview, tx);
          const execution = await tx.schoolAiExecution.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version, operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey, receipt: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, workspaceId: record.id, workspaceVersion: record.version } } });
          return receipt(execution);
        }
        if (input.operation === "communications.queue_announcement") {
          await assertAnnouncementAccess(user, tx);
          const prepared = await buildAnnouncementPreview(user, record, tx);
          if (prepared.preview.previewHash !== input.previewHash) throw new SchoolAiError("Announcement recipients, language or approval changed. Review a fresh preview.", 409, "STALE_EXECUTION_PREVIEW");
          const result = await queueAnnouncement(user, record, prepared, tx);
          const execution = await tx.schoolAiExecution.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version, operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey, receipt: result } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, workspaceId: record.id, workspaceVersion: record.version, queuedCount: result.queuedCount } } });
          return receipt(execution);
        }
        if (input.operation === "timetable.create_draft") {
          await lockTimetableCampus(tx, user.schoolId, record.campusId);
          await assertTimetableWriteAccess(user, record.campusId, "add", tx);
          const preview = await previewTimetableSetup(user, record, tx);
          if (preview.previewHash !== input.previewHash) throw new SchoolAiError("Timetable references or school schedules changed. Review a fresh preview before creating this draft.", 409, "STALE_EXECUTION_PREVIEW");
          const result = await applyTimetableSetup(user, preview, tx);
          const execution = await tx.schoolAiExecution.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version, operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey, receipt: result } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, workspaceId: record.id, workspaceVersion: record.version, ...result } } });
          return receipt(execution);
        }
        if (input.operation === "academics.setup_year") {
          const preview = await previewAcademicSetup(user, record, tx);
          if (preview.previewHash !== input.previewHash) throw new SchoolAiError("The cycle or classes changed. Review a fresh preview before applying setup.", 409, "STALE_EXECUTION_PREVIEW");
          const result = await applyAcademicSetup(user, preview, tx);
          const execution = await tx.schoolAiExecution.create({ data: { schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version, operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey, receipt: result } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, workspaceId: record.id, workspaceVersion: record.version, academicYear: preview.academicYear, ...result } } });
          return receipt(execution);
        }
        const { preview, existing } = await previewInTransaction(user, record, tx);
        if (preview.previewHash !== input.previewHash) throw new SchoolAiError("The curriculum or existing syllabus changed. Review a fresh preview before importing.", 409, "STALE_EXECUTION_PREVIEW");
        let order = existing.reduce((max, topic) => Math.max(max, topic.order), -1) + 1;
        const topicIds = preview.willKeep.map((item) => item.topicId);
        for (const item of preview.willCreate) {
          const topic = await tx.syllabusTopic.create({ data: { schoolId: user.schoolId, subjectId: preview.subjectId, title: item.title, description: item.description, order: order++, status: "NOT_STARTED" } });
          topicIds.push(topic.id);
        }
        const execution = await tx.schoolAiExecution.create({ data: {
          schoolId: user.schoolId, campusId: record.campusId, recordId: record.id, recordVersion: record.version,
          operation: input.operation, previewHash: input.previewHash, requestedById: user.userId, idempotencyKey: input.idempotencyKey,
          receipt: { createdCount: preview.willCreate.length, keptCount: preview.willKeep.length, topicIds },
        } });
        await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_executions", recordId: execution.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: input.operation, curriculumId: record.id, curriculumVersion: record.version, subjectId: preview.subjectId, createdCount: preview.willCreate.length, keptCount: preview.willKeep.length, topicIds } } });
        return receipt(execution);
      };
      return existingTransaction ? await perform(existingTransaction) : await transaction(user, perform);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        const previous = await replay(existingTransaction ?? prisma);
        if (previous) return previous;
        throw new SchoolAiError("School information changed during execution. Review a new preview and retry.", 409, "STALE_EXECUTION_PREVIEW");
      }
      throw error;
    }
  };
  return existingTransaction ? work() : withContext(user, work);
}

export async function listSchoolAiExecutions(user: AuthUser, id: string): Promise<AnySchoolAiExecutionReceipt[]> {
  return withContext(user, async () => {
    assertApprovalRole(user);
    const permissions = await loadWorkspacePermissionSnapshot(user);
    await assertSchoolAiAccess(user, "edit", permissions);
    const record = await prisma.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) }, select: { id: true, campusId: true, kind: true, data: true } });
    if (!record) throw new SchoolAiError("Workspace item not found.", 404);
    await assertWorkspaceDomainPermission(user,record.kind as import("./types").WorkspaceKind,record.data as Record<string,unknown>,"view",permissions);
    const proposal = (record.data as { proposal?: { operation?: string } }).proposal;
    const operation = executionOperationSchema.safeParse(proposal?.operation);
    const recordOperation = record.kind === "WORKFLOW" && operation.success ? operation.data : "curriculum.import_topics";
    // G42: a reader whose seat never runs this tool (the group admin drafting set-up, for one) has no receipt it could
    // see — the loop below drops every row outside the allow-list — so its history is empty, not a 403 that would
    // show a failure beside a draft it may review. Preview and execute still refuse it in authorize().
    const tools = await allowedSchoolAiOperations(user, user.campusId);
    if (!tools.has(recordOperation)) return [];
    await authorize(user, recordOperation, permissions);
    if (operation.success && operation.data === "setup.apply_changes") await assertSchoolSetupRecordAccess(user,id,prisma);
    if (operation.success && operation.data === "finance.apply_operation") await assertFinanceOperationsAccess(user, prisma);
    if (operation.success && isSchoolOperationsOperation(operation.data)) await assertSchoolOperationsAccess(user, operation.data, prisma, record.campusId ?? "");
    if (operation.success && operation.data === "fees.generate_invoices") await assertFeeInvoiceAccess(user, prisma);
    if (operation.success && operation.data === "exams.create_session_plan") await assertExamSessionPlanAccess(user, prisma, record.campusId ?? undefined);
    const rows=await prisma.schoolAiExecution.findMany({where:{recordId:id,schoolId:user.schoolId,...(user.role!=="SUPER_ADMIN"?{campusId:user.campusId??""}:{})},orderBy:{createdAt:"desc"},take:50});
    const allowed:AnySchoolAiExecutionReceipt[]=[];
    for(const item of rows){const operation=executionOperationSchema.safeParse(item.operation);if(!operation.success||!hasToolPermission(permissions,operation.data,tools))continue;
      if(operation.data==="operations.record_risk_decision"){const revision=await prisma.schoolAiRevision.findFirst({where:{schoolId:user.schoolId,recordId:id,version:item.recordVersion},select:{data:true}});if(!revision)continue;try{await assertWorkspaceDomainPermission(user,"WORKFLOW",revision.data as Record<string,unknown>,"view",permissions);}catch(error){if(error instanceof SchoolAiError&&error.status===403)continue;throw error;}}
      if(operation.data==="setup.apply_changes"){try{await assertSchoolSetupRecordAccess(user,id,prisma,item.recordVersion);}catch(error){if(error instanceof SchoolAiError&&[403,404].includes(error.status))continue;throw error;}}
      allowed.push(receipt(item));
    }return allowed;
  });
}
