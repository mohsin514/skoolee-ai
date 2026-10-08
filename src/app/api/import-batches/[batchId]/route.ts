import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertStaffRole, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { summarizeImportRows, type ImportRow } from "@/lib/imports/batch";
import { isoDate } from "@/lib/imports/batch";
import { studentSchema } from "@/lib/validators/schemas";

type RouteContext = { params: Promise<{ batchId: string }> };
type Batch = NonNullable<Awaited<ReturnType<typeof findBatch>>>;

async function findBatch(id: string, schoolId: string, campusId: string) {
  return prisma.importBatch.findFirst({ where: { id, schoolId, campusId } });
}

function rowsFrom(batch: Batch): ImportRow[] {
  const data = batch.data as Prisma.JsonObject;
  return Array.isArray(data.rows) ? data.rows as unknown as ImportRow[] : [];
}

function metadataFrom(batch: Batch): Record<string, unknown> {
  const data = batch.data as Prisma.JsonObject;
  return data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? data.metadata as Record<string, unknown> : {};
}

function receiptCounts(value: Prisma.JsonValue | null) {
  const receipt = value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
  const summary = receipt.summary && typeof receipt.summary === "object" && !Array.isArray(receipt.summary) ? receipt.summary as Prisma.JsonObject : {};
  return {
    total: Number(summary.total) || 0,
    accepted: Number(summary.committed ?? summary.created ?? summary.accepted) || 0,
    rejected: Number(summary.rejected) || 0,
    skipped: Number(summary.skipped) || 0,
    unresolved: Number(summary.unresolved) || 0,
  };
}

function response(batch: Batch) {
  const rows = rowsFrom(batch);
  const data = batch.data as Prisma.JsonObject;
  return {
    id: batch.id,
    campusId: batch.campusId,
    kind: batch.kind,
    state: batch.state,
    sourceName: batch.sourceName,
    createdAt: batch.createdAt,
    expiresAt: batch.expiresAt,
    summary: batch.receipt ? receiptCounts(batch.receipt) : data.summary && typeof data.summary === "object" ? data.summary : summarizeImportRows(rows),
    rows: batch.state === "STAGED" ? rows : undefined,
    receipt: batch.receipt,
  };
}

async function authorizedBatch(id: string, request: NextRequest, action: "view" | "add" | "delete") {
  const user = await requireAuthUser();
  assertStaffRole(user);
  const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
  const batch = await findBatch(id, user.schoolId, campusId);
  if (!batch) throw new ApiError("Import batch not found", 404);
  if (batch.kind === "STUDENT_ROSTER" && !canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
  if (action !== "view" && batch.kind === "STUDENT_ROSTER" && !canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
  await assertPermission(user, batch.kind === "STUDENT_ROSTER" ? "students" : "fees", action);
  return { user, batch };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { batchId } = await context.params;
    const { batch } = await authorizedBatch(batchId, request, "view");
    if (batch.state === "STAGED" && batch.expiresAt <= new Date()) {
      const rows = rowsFrom(batch);
      const receipt = { summary: summarizeImportRows(rows), expiredAt: new Date().toISOString() };
      const expired = await prisma.importBatch.update({ where: { id: batch.id }, data: { state: "EXPIRED", data: { rows: [], metadata: {} }, receipt } });
      return Response.json({ success: true, data: response(expired) });
    }
    return Response.json({ success: true, data: response(batch) });
  } catch (error) {
    return errorResponse(error, "[import-batches] GET failed");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { batchId } = await context.params;
    const { batch } = await authorizedBatch(batchId, request, "add");
    if (batch.state !== "STAGED" || batch.expiresAt <= new Date()) throw new ApiError("This staging batch is no longer available", 409);
    const body = await request.json() as { rows?: Array<{ rowNumber?: number; selected?: boolean; matchedInvoiceId?: string | null; proposal?: Record<string, unknown>; skip?: boolean }> };
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 1000) throw new ApiError("Choose at least one row to update", 400);
    const { user } = await authorizedBatch(batchId, request, "add");
    const rows = rowsFrom(batch);
    const metadata = metadataFrom(batch);
    const changes = new Map<number, (typeof body.rows)[number]>();
    for (const change of body.rows) {
      if (!Number.isInteger(change.rowNumber) || changes.has(change.rowNumber!)) throw new ApiError("Invalid or repeated row number", 400);
      changes.set(change.rowNumber!, change);
    }

    for (const row of rows) {
      const change = changes.get(row.rowNumber);
      if (!change) continue;
      if (batch.kind === "STUDENT_ROSTER" && change.skip) {
        row.state = "SKIPPED";
        row.selected = false;
        row.errors = row.errors.length ? row.errors : ["Excluded by staff during preview"];
        continue;
      }
      if (batch.kind === "STUDENT_ROSTER" && change.proposal) {
        const parsed = studentSchema.safeParse({ ...row.proposal, ...change.proposal });
        if (!parsed.success) {
          row.state = "REJECTED";
          row.selected = false;
          row.errors = parsed.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`);
          continue;
        }
        const proposal = parsed.data;
        const errors: string[] = [];
        if (proposal.dateOfBirth && !isoDate(proposal.dateOfBirth)) errors.push("dateOfBirth: Use a real date in YYYY-MM-DD format");
        const targetClass = await prisma.class.findFirst({ where: { id: proposal.classId, campusId: batch.campusId, campus: { schoolId: user.schoolId } }, select: { id: true, name: true, section: true } });
        if (!targetClass) errors.push("classId: Class is outside the selected campus or does not exist");
        const matchKey = `class:${proposal.classId}/roll:${proposal.rollNo}`;
        const existing = await prisma.student.findFirst({ where: { schoolId: user.schoolId, campusId: batch.campusId, archivedAt: null, rollNo: { equals: proposal.rollNo, mode: "insensitive" } }, select: { id: true, classId: true, fullName: true } });
        const duplicateRow = rows.find((candidate) => candidate.rowNumber !== row.rowNumber && candidate.proposal && candidate.state !== "SKIPPED" && candidate.state !== "REJECTED" && String(candidate.proposal.classId) === proposal.classId && String(candidate.proposal.rollNo).trim().toLocaleLowerCase() === proposal.rollNo.trim().toLocaleLowerCase());
        row.proposal = proposal as unknown as Record<string, unknown>;
        row.matchKey = matchKey;
        if (existing?.classId === proposal.classId) {
          row.state = "SKIPPED";
          row.selected = false;
          row.matchLabel = `Existing pupil: ${existing.fullName}`;
          row.errors = ["This stable class and roll-number key already exists. Review the existing record; it will not be overwritten."];
        } else if (existing || duplicateRow) {
          row.state = "UNRESOLVED";
          row.selected = false;
          row.matchLabel = existing ? "Roll number is in use in another class" : `Also appears in row ${duplicateRow?.rowNumber}`;
          row.errors = ["This stable class and roll-number key conflicts with another pupil. Change the class or roll number, or skip this row."];
        } else if (errors.length) {
          row.state = "REJECTED";
          row.selected = false;
          row.errors = errors;
        } else {
          row.state = "ACCEPTED";
          row.selected = true;
          row.matchLabel = `${targetClass?.name || ""}${targetClass?.section ? ` · ${targetClass.section}` : ""}`;
          row.errors = [];
        }
        continue;
      }
      if (batch.kind === "STUDENT_ROSTER" && row.state === "ACCEPTED") {
        if (typeof change.selected === "boolean") row.selected = change.selected;
      } else if (batch.kind === "BANK_STATEMENT") {
        if (change.skip) {
          row.state = "SKIPPED";
          row.selected = false;
          row.errors = [];
          continue;
        }
        if (typeof change.matchedInvoiceId === "string") {
          const candidates = Array.isArray(row.proposal?.candidates) ? row.proposal.candidates as Array<Record<string, unknown>> : [];
          if (!candidates.some((candidate) => candidate.id === change.matchedInvoiceId)) throw new ApiError("Choose an invoice from this row's scoped candidates", 400);
          const invoice = await prisma.invoice.findFirst({ where: { id: change.matchedInvoiceId, schoolId: user.schoolId, campusId: batch.campusId, currency: String(metadata.currency), status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, balanceDue: { gt: 0 } }, select: { id: true, invoiceNumber: true, balanceDue: true, student: { select: { fullName: true } } } });
          const amount = Number(row.proposal?.amountMinor);
          if (!invoice || amount > invoice.balanceDue) throw new ApiError("That invoice is no longer eligible for this transaction", 409);
          row.proposal = { ...row.proposal, matchedInvoiceId: invoice.id, studentName: invoice.student.fullName };
          row.matchKey = invoice.invoiceNumber ? `invoice:${invoice.invoiceNumber}` : null;
          row.matchLabel = invoice.student.fullName;
          row.state = "ACCEPTED";
          row.errors = [];
          row.selected = typeof change.selected === "boolean" ? change.selected : true;
        } else if (change.matchedInvoiceId === null) {
          row.proposal = { ...row.proposal, matchedInvoiceId: null, studentName: null };
          row.matchKey = null;
          row.matchLabel = "No invoice linked";
          row.state = "ACCEPTED";
          row.errors = [];
          row.selected = typeof change.selected === "boolean" ? change.selected : true;
        } else if (row.state === "ACCEPTED" && typeof change.selected === "boolean") {
          row.selected = change.selected;
        }
      }
    }

    const updated = await prisma.importBatch.update({ where: { id: batch.id }, data: { data: { rows, metadata, summary: summarizeImportRows(rows) } as Prisma.InputJsonValue } });
    return Response.json({ success: true, data: response(updated) });
  } catch (error) {
    return errorResponse(error, "[import-batches] PATCH failed");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { batchId } = await context.params;
    const body = await request.json() as { action?: string };
    if (body.action === "commit") {
      const { user, batch } = await authorizedBatch(batchId, request, "add");
      if (batch.state === "COMMITTED" || batch.state === "PARTIAL" || batch.state === "REVERSED") return Response.json({ success: true, data: response(batch), idempotent: true });
      if (batch.kind === "STUDENT_ROSTER") throw new ApiError("Commit student batches through the roster endpoint", 400);
      if (batch.state !== "STAGED" || batch.expiresAt <= new Date()) throw new ApiError("This staging batch is no longer available", 409);
      const rows = rowsFrom(batch);
      const selected = rows.filter((row) => row.state === "ACCEPTED" && row.selected);
      if (!selected.length || rows.some((row) => row.state === "UNRESOLVED" && row.selected)) throw new ApiError("Select at least one validated row and resolve selected conflicts", 400);
      const metadata = metadataFrom(batch);
      const result = await prisma.$transaction(async (tx) => {
        const locked = await tx.importBatch.updateMany({ where: { id: batch.id, schoolId: user.schoolId, campusId: batch.campusId, state: "STAGED", expiresAt: { gt: new Date() } }, data: { state: "COMMITTING" } });
        if (locked.count !== 1) throw new ApiError("Another request already committed or expired this batch", 409);
        const matched = selected.filter((row) => row.proposal?.matchedInvoiceId);
        const unmatched = selected.filter((row) => !row.proposal?.matchedInvoiceId);
        const reconciliation = await tx.bankReconciliation.create({ data: {
          schoolId: user.schoolId,
          campusId: batch.campusId,
          importDate: new Date(),
          bankAccount: String(metadata.accountName),
          statementPeriodFrom: new Date(`${metadata.statementFrom}T00:00:00.000Z`),
          statementPeriodTo: new Date(`${metadata.statementTo}T00:00:00.000Z`),
          totalTransactions: selected.length,
          matchedCount: matched.length,
          unmatchedCount: unmatched.length,
          reconciliationDetailsJson: matched.map((row) => ({ ...(row.proposal as object), rowNumber: row.rowNumber })) as Prisma.InputJsonValue,
          unmatchedJson: unmatched.map((row) => ({ ...(row.proposal as object), rowNumber: row.rowNumber })) as Prisma.InputJsonValue,
          status: "pending",
          reconciledBy: user.userId,
          reconciledAt: new Date(),
        } });
        const receipt = {
          batchId: batch.id,
          kind: batch.kind,
          reconciliationId: reconciliation.id,
          committedAt: new Date().toISOString(),
          summary: { total: rows.length, committed: selected.length, matched: matched.length, unmatched: unmatched.length, skipped: rows.filter((row) => !row.selected || row.state === "SKIPPED").length, rejected: rows.filter((row) => row.state === "REJECTED").length },
          rows: rows.map((row) => ({ rowNumber: row.rowNumber, state: row.selected ? row.state : row.state === "ACCEPTED" ? "SKIPPED" : row.state, selected: row.selected, matchKey: row.matchKey, matchLabel: row.matchLabel, errors: row.errors, result: row.selected ? { reconciliationId: reconciliation.id } : undefined })),
          reversal: { state: "ELIGIBLE", message: "The reconciliation has not posted payments. Reversal will mark this receipt reversed and retain its history." },
        };
        const updatedBatch = await tx.importBatch.update({ where: { id: batch.id }, data: { state: "COMMITTED", committedAt: new Date(), data: { rows: [], metadata: {}, summary: receipt.summary } as Prisma.InputJsonValue, receipt: receipt as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "import_batch", recordId: batch.id, newValue: { action: "COMMITTED", kind: batch.kind, reconciliationId: reconciliation.id, summary: receipt.summary } as Prisma.InputJsonValue, userId: user.userId } });
        return { batch: updatedBatch, receipt };
      });
      return Response.json({ success: true, data: response(result.batch), receipt: result.receipt });
    }

    if (body.action === "reversal-check" || body.action === "reverse") {
      const permission = body.action === "reverse" ? "delete" : "view";
      const { user, batch } = await authorizedBatch(batchId, request, permission);
      if (batch.state !== "COMMITTED" && batch.state !== "PARTIAL") throw new ApiError("Only a committed batch can be reversed", 409);
      const receipt = batch.receipt as Prisma.JsonObject | null;
      if (batch.kind === "BANK_STATEMENT") {
        const reconciliationId = typeof receipt?.reconciliationId === "string" ? receipt.reconciliationId : "";
        const reconciliation = await prisma.bankReconciliation.findFirst({ where: { id: reconciliationId, schoolId: user.schoolId, campusId: batch.campusId }, select: { id: true, status: true } });
        const eligible = reconciliation?.status === "pending";
        const analysis = { eligible, dependencies: eligible ? [] : ["Reconciliation is missing or no longer pending. Use the finance correction route to resolve downstream changes."], action: "Mark the reconciliation reversed while retaining the receipt." };
        if (body.action === "reversal-check") return Response.json({ success: true, data: analysis });
        if (!eligible || !reconciliation) throw new ApiError(analysis.dependencies.join(" "), 409);
        const reversedAt = new Date();
        const updated = await prisma.$transaction(async (tx) => {
          const changed = await tx.bankReconciliation.updateMany({ where: { id: reconciliation.id, schoolId: user.schoolId, campusId: batch.campusId, status: "pending" }, data: { status: "reversed" } });
          if (!changed.count) throw new ApiError("Reconciliation changed during reversal; recheck its dependencies", 409);
          const newReceipt = { ...(receipt || {}), reversal: { state: "REVERSED", reversedAt: reversedAt.toISOString(), actorId: user.userId, reconciliationId: reconciliation.id } };
          const result = await tx.importBatch.update({ where: { id: batch.id }, data: { state: "REVERSED", reversedAt, receipt: newReceipt as Prisma.InputJsonValue } });
          await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "import_batch", recordId: batch.id, oldValue: { state: "COMMITTED" }, newValue: { action: "REVERSED", reconciliationId: reconciliation.id }, userId: user.userId } });
          return result;
        });
        return Response.json({ success: true, data: response(updated) });
      }

      const receiptRows = Array.isArray(receipt?.rows) ? receipt.rows as Array<Record<string, unknown>> : [];
      const studentIds = receiptRows.flatMap((row) => typeof row.studentId === "string" ? [row.studentId] : []);
      const students = studentIds.length ? await prisma.student.findMany({ where: { id: { in: studentIds }, schoolId: user.schoolId, campusId: batch.campusId }, select: { id: true, fullName: true, rollNo: true, _count: { select: { attendance: true, invoices: true, marks: true, reportCards: true, examSeats: true, payments: true, guardianRelationships: true, classHistory: true, enrollments: true, enrollmentProposals: true, corrections: true, documents: true } } } }) : [];
      const dependencies = students.flatMap((student) => {
        const count = student._count;
        const refs = Object.entries(count).filter(([, value]) => value > 0).map(([name, value]) => `${name}: ${value}`);
        return refs.length ? [{ studentId: student.id, studentName: student.fullName, rollNo: student.rollNo, references: refs }] : [];
      });
      const missing = studentIds.filter((id) => !students.some((student) => student.id === id));
      const eligible = studentIds.length > 0 && !dependencies.length && !missing.length;
      const analysis = { eligible, dependencies, missing, action: eligible ? "Delete only the unchanged pupils created by this batch; associated admission timeline entries are removed with each pupil." : "Destructive reversal is blocked. Keep the pupil and use the applicable student or finance correction route for referenced records." };
      if (body.action === "reversal-check") return Response.json({ success: true, data: analysis });
      if (!eligible) throw new ApiError(analysis.action, 409);
      const reversedAt = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        const stillPresent = await tx.student.findMany({ where: { id: { in: studentIds }, schoolId: user.schoolId, campusId: batch.campusId }, select: { id: true, _count: { select: { attendance: true, invoices: true, marks: true, reportCards: true, examSeats: true, payments: true, guardianRelationships: true, classHistory: true, enrollments: true, enrollmentProposals: true, corrections: true, documents: true } } } });
        if (stillPresent.length !== studentIds.length || stillPresent.some((student) => Object.values(student._count).some((count) => count > 0))) throw new ApiError("Pupil dependencies changed during reversal; recheck before trying again", 409);
        await tx.student.deleteMany({ where: { id: { in: studentIds }, schoolId: user.schoolId, campusId: batch.campusId } });
        const newReceipt = { ...(receipt || {}), reversal: { state: "REVERSED", reversedAt: reversedAt.toISOString(), actorId: user.userId, deletedStudentIds: studentIds } };
        const result = await tx.importBatch.update({ where: { id: batch.id }, data: { state: "REVERSED", reversedAt, receipt: newReceipt as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "import_batch", recordId: batch.id, oldValue: { state: "COMMITTED" }, newValue: { action: "REVERSED", deletedStudentIds: studentIds }, userId: user.userId } });
        return result;
      });
      return Response.json({ success: true, data: response(updated) });
    }
    throw new ApiError("Choose a supported batch action", 400);
  } catch (error) {
    return errorResponse(error, "[import-batches] POST failed");
  }
}
