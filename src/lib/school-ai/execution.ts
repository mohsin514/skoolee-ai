import { Prisma, type SchoolAiExecution, type SchoolAiRecord } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { schoolAiTransaction as transaction } from "./transaction";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspaceSubject, loadWorkspacePermissionSnapshot, SchoolAiError, type WorkspacePermissionSnapshot } from "./access";
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
  "fees.generate_invoices": { kind: "WORKFLOW", permission: "fees.view+add", requiresApprovedVersion: true, effect: "Create exactly reviewed fee invoices; preserve payments and ledger postings." },
  "exams.create_session_plan": { kind: "WORKFLOW", permission: "exams.view+add+edit,students.view", requiresApprovedVersion: true, effect: "Create a draft exam session, datesheet, seating and invigilator duties." },
  "curriculum.import_topics": { kind: "CURRICULUM", permission: "exams.edit", requiresApprovedVersion: true, effect: "Append missing subject syllabus topics; preserve existing topics." },
  "academics.setup_year": { kind: "WORKFLOW", permission: "students.add+exams.edit", requiresApprovedVersion: true, effect: "Create a draft academic cycle and missing classes; preserve existing academic records." },
  "timetable.create_draft": { kind: "WORKFLOW", permission: "timetable.view+add", requiresApprovedVersion: true, effect: "Create one reviewed draft timetable with current references and clash checks; preserve existing schedules." },
  "communications.queue_announcement": { kind: "WORKFLOW", permission: "students.view+edit", requiresApprovedVersion: true, effect: "Queue exact reviewed guardian email text and audience; reauthorize every recipient before delivery." },
} as const;
export type SchoolAiOperation = keyof typeof SCHOOL_AI_TOOLS;
export const executionOperationSchema = z.enum(["curriculum.import_topics", "academics.setup_year", "timetable.create_draft", "communications.queue_announcement", "exams.create_session_plan", "fees.generate_invoices"]);
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
export type AnySchoolAiExecutionReceipt = SchoolAiExecutionReceipt | AcademicSetupExecutionReceipt | TimetableSetupExecutionReceipt | AnnouncementExecutionReceipt | ExamSessionPlanExecutionReceipt | FeeInvoiceExecutionReceipt;
export type SchoolAiExecutionPreview = CurriculumImportPreview | AcademicSetupPreview | TimetableSetupPreview | AnnouncementPreview | ExamSessionPlanPreview | FeeInvoicePreview;

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

function hasToolPermission(permissions: WorkspacePermissionSnapshot, operation: SchoolAiOperation) {
  if (operation === "fees.generate_invoices") return permissions.get("fees")?.canView && permissions.get("fees")?.canAdd;
  if (operation === "exams.create_session_plan") return permissions.get("exams")?.canView && permissions.get("exams")?.canAdd && permissions.get("exams")?.canEdit && permissions.get("students")?.canView;
  if (operation === "communications.queue_announcement") return permissions.get("students")?.canView && permissions.get("students")?.canEdit;
  return operation === "timetable.create_draft" ? permissions.get("timetable")?.canView && permissions.get("timetable")?.canAdd : permissions.get("exams")?.canEdit && permissions.get("exams")?.canView && (operation !== "academics.setup_year" || permissions.get("students")?.canView && permissions.get("students")?.canAdd);
}
async function authorize(user: AuthUser, operation: SchoolAiOperation = "curriculum.import_topics", snapshot?: WorkspacePermissionSnapshot) {
  assertApprovalRole(user); // Mirrors the existing syllabus management boundary.
  const permissions = snapshot ?? await loadWorkspacePermissionSnapshot(user);
  await assertSchoolAiAccess(user, "edit", permissions);
  if (!hasToolPermission(permissions, operation)) throw new SchoolAiError("Your current permissions do not allow this operation.", 403, "PERMISSION_DENIED");
  await assertSchoolOperational(user.schoolId);
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
export function previewSchoolAiExecution(user: AuthUser, id: string, operation: SchoolAiOperation, version: number): Promise<SchoolAiExecutionPreview>;
export async function previewSchoolAiExecution(user: AuthUser, id: string, operation: SchoolAiOperation, version: number): Promise<SchoolAiExecutionPreview> {
  return withContext(user, async () => {
    if (!executionOperationSchema.safeParse(operation).success || !Number.isSafeInteger(version) || version < 1) throw new SchoolAiError("Choose a supported tool and saved version.", 400, "INVALID_OPERATION");
    await authorize(user, operation);
    return transaction(user, async (tx) => {
      const record = await approvedRecord(user, id, operation, version, tx);
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
export function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput): Promise<AnySchoolAiExecutionReceipt>;
export async function executeSchoolAiTool(user: AuthUser, id: string, rawInput: SchoolAiExecutionInput): Promise<AnySchoolAiExecutionReceipt> {
  return withContext(user, async () => {
    const input = executionInputSchema.parse(rawInput);
    await authorize(user, input.operation);
    const replay = async (db: TxClient) => {
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
      const previous = await replay(prisma);
      if (previous) return previous;
      return await transaction(user, async (tx) => {
        const completed = await replay(tx);
        if (completed) return completed;
        const record = await approvedRecord(user, id, input.operation, input.version, tx);
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
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        const previous = await replay(prisma);
        if (previous) return previous;
        throw new SchoolAiError("School information changed during execution. Review a new preview and retry.", 409, "STALE_EXECUTION_PREVIEW");
      }
      throw error;
    }
  });
}

export async function listSchoolAiExecutions(user: AuthUser, id: string): Promise<AnySchoolAiExecutionReceipt[]> {
  return withContext(user, async () => {
    assertApprovalRole(user);
    const permissions = await loadWorkspacePermissionSnapshot(user);
    await assertSchoolAiAccess(user, "edit", permissions);
    const record = await prisma.schoolAiRecord.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) }, select: { id: true, campusId: true, kind: true, data: true } });
    if (!record) throw new SchoolAiError("Workspace item not found.", 404);
    const proposal = (record.data as { proposal?: { operation?: string } }).proposal;
    const operation = executionOperationSchema.safeParse(proposal?.operation);
    await authorize(user, record.kind === "WORKFLOW" && operation.success ? operation.data : "curriculum.import_topics", permissions);
    if (operation.success && operation.data === "fees.generate_invoices") await assertFeeInvoiceAccess(user, prisma);
    if (operation.success && operation.data === "exams.create_session_plan") await assertExamSessionPlanAccess(user, prisma, record.campusId ?? undefined);
    return (await prisma.schoolAiExecution.findMany({ where: { recordId: id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) }, orderBy: { createdAt: "desc" }, take: 50 })).filter(item => {
      const operation = executionOperationSchema.safeParse(item.operation);
      return operation.success && hasToolPermission(permissions, operation.data);
    }).map(receipt);
  });
}
