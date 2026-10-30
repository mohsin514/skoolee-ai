import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertStaffRole, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { recordPayment } from "@/lib/fees/payment";
import { conservationReport } from "@/lib/fees/bank-reconciliation";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-432: a committed bank statement is posted as payments in one reviewed step. Each matched row
// becomes one payment keyed to its bank transaction, so a replay posts nothing twice; rows whose
// invoice is no longer payable become visible exceptions; unmatched money stays unallocated.

type Row = { rowNumber: number; date: string; amountMinor: number; description: string; rowKey?: string; matchedInvoiceId?: string | null; studentName?: string | null };
/** SKAI-1282: rows staged by the job importer before this fix carry `amount` (minor units) and no row number. */
type StoredRow = Partial<Row> & { amount?: number };

function storedRows(value: Prisma.JsonValue): Row[] {
  return ((value as StoredRow[] | null) ?? []).map((row, index) => ({
    ...row, rowNumber: row.rowNumber ?? index + 1, date: row.date ?? "", description: row.description ?? "",
    amountMinor: Number.isSafeInteger(row.amountMinor) ? row.amountMinor! : Number.isSafeInteger(row.amount) ? row.amount! : 0,
  }));
}
type Posted = { rowNumber: number; paymentId: string; receiptNo: string | null; allocated: number; credited: number };
type Exception = { rowNumber: number; amountMinor: number; reason: string };

function report(rec: { status: string; reconciliationDetailsJson: Prisma.JsonValue; unmatchedJson: Prisma.JsonValue }, posting: { posted?: Posted[]; exceptions?: Exception[] } | null) {
  const matched = storedRows(rec.reconciliationDetailsJson), unmatched = storedRows(rec.unmatchedJson);
  const received = [...matched, ...unmatched].map(row => row.amountMinor);
  if (rec.status === "posted" && posting) {
    return conservationReport({ received, allocated: (posting.posted ?? []).map(p => p.allocated), credited: (posting.posted ?? []).map(p => p.credited), unallocated: [...unmatched.map(row => row.amountMinor), ...(posting.exceptions ?? []).map(e => e.amountMinor)] });
  }
  return conservationReport({ received, allocated: matched.map(row => row.amountMinor), credited: [], unallocated: unmatched.map(row => row.amountMinor) });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "view");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    const rows = await prisma.bankReconciliation.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" }, take: 30 });
    const audits = await prisma.auditLog.findMany({ where: { schoolId: user.schoolId, tableName: "bank_reconciliation_posting", recordId: { in: rows.map(r => r.id) } }, select: { recordId: true, newValue: true } });
    const postings = new Map(audits.map(a => [a.recordId, a.newValue as { posted?: Posted[]; exceptions?: Exception[] }]));
    return Response.json({ success: true, data: rows.map(rec => ({
      id: rec.id, status: rec.status, bankAccount: rec.bankAccount, from: rec.statementPeriodFrom?.toISOString().slice(0, 10) ?? null, to: rec.statementPeriodTo?.toISOString().slice(0, 10) ?? null,
      matched: storedRows(rec.reconciliationDetailsJson), unmatched: storedRows(rec.unmatchedJson),
      posting: postings.get(rec.id) ?? null, report: report(rec, postings.get(rec.id) ?? null),
    })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[fees/reconciliations] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "add");
    const body = await parseBody(req, jsonObjectBody);
    if (body.action !== "post") throw new ApiError("action must be post", 400);
    const result = await prisma.$transaction(async (tx) => {
      const rec = await tx.bankReconciliation.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId } });
      if (!rec) throw new ApiError("Reconciliation not found", 404);
      await resolveCampusId(user, rec.campusId);
      await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${rec.id} FOR UPDATE`;
      const current = await tx.bankReconciliation.findUniqueOrThrow({ where: { id: rec.id } });
      if (current.status === "posted") return { id: rec.id, replayed: true };
      if (current.status !== "pending") throw new ApiError("Only a pending reconciliation can be posted.", 409);
      const posted: Posted[] = [], exceptions: Exception[] = [];
      for (const row of storedRows(current.reconciliationDetailsJson)) {
        const invoice = row.matchedInvoiceId ? await tx.invoice.findFirst({ where: { id: row.matchedInvoiceId, schoolId: user.schoolId, campusId: current.campusId }, select: { id: true, studentId: true, status: true, balanceDue: true } }) : null;
        if (row.amountMinor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) { exceptions.push({ rowNumber: row.rowNumber, amountMinor: Math.max(0, row.amountMinor), reason: "This row has no valid amount or date. The money stays unallocated for review." }); continue; }
        if (!invoice || invoice.status === "CANCELLED" || invoice.balanceDue <= 0) { exceptions.push({ rowNumber: row.rowNumber, amountMinor: row.amountMinor, reason: "The matched invoice is no longer payable. The money stays unallocated for review." }); continue; }
        const result = await recordPayment(tx, { campusId: current.campusId, invoiceId: invoice.id, studentId: invoice.studentId, amount: row.amountMinor, paymentDate: new Date(`${row.date}T00:00:00.000Z`), paymentMethod: "BANK", referenceNumber: row.rowKey ? `BANK-${row.rowKey.slice(0, 24)}` : `BANK-${current.id.slice(0, 8)}-${row.rowNumber}`, note: `Bank statement row ${row.rowNumber}: ${row.description}`.slice(0, 300), recordedBy: user.userId });
        posted.push({ rowNumber: row.rowNumber, paymentId: result.payment.id, receiptNo: result.receiptNo, allocated: row.amountMinor - result.credit, credited: result.credit });
        if (row.rowKey) await tx.bankTransactionKey.updateMany({ where: { campusId: current.campusId, rowKey: row.rowKey }, data: { paymentId: result.payment.id } });
      }
      await tx.bankReconciliation.update({ where: { id: current.id }, data: { status: "posted", reconciledBy: user.userId, reconciledAt: new Date() } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "bank_reconciliation_posting", recordId: current.id, userId: user.userId, newValue: { posted, exceptions } as unknown as Prisma.InputJsonValue } });
      return { id: current.id, replayed: false };
    }, { timeout: 60000 });
    return Response.json({ success: true, data: result });
  } catch (error) {
    // SKAI-1282: a clashing payment reference rolls the whole posting back; report it, never a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return errorResponse(new ApiError("A payment with the same bank reference already exists. Nothing was posted; review the statement.", 409), "[fees/reconciliations] POST failed");
    return errorResponse(error, "[fees/reconciliations] POST failed");
  }
}
