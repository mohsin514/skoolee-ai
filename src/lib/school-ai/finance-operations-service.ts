import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { recordPayment } from "@/lib/fees/payment";
import { assertBankPeriodOpen } from "@/lib/fees/ledger-protection";
import { capturePaymentReceipt } from "@/lib/fees/receipt";
import { assertFeeInvoiceAccess } from "./fee-invoices-service";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { financeOperationProposalSchema, projectRevenue, type FinanceOperationsOptions, type FinanceOperationsPreview, type FinanceOperationsResult, type FinanceOperationProposal, type FinanceEffect } from "./finance-operations";

type RecordWithCampus = SchoolAiRecord & { campusId: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const day = (value: Date) => value.toISOString().slice(0, 10);
const at = (value: string) => new Date(`${value}T00:00:00.000Z`);
const fail = (code: string) => { throw new SchoolAiError("Review the financial evidence and refresh the preview.", 409, code); };
export async function assertFinanceOperationsAccess(user: AuthUser, db: TxClient = prisma) {
  await assertFeeInvoiceAccess(user, db);
  const grants = await loadWorkspacePermissionSnapshot(user, db);
  await assertWorkspacePermission(user, "fees", "edit", grants);
  await assertWorkspacePermission(user, "accounts", "view", grants);
  await assertWorkspacePermission(user, "accounts", "add", grants);
}
const scope = (user: AuthUser, campusId: string) => ({ schoolId: user.schoolId, campusId });
export async function getFinanceOperationsOptions(user: AuthUser, requestedCampusId?: string | null): Promise<FinanceOperationsOptions> {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () => {
    await assertFinanceOperationsAccess(user);
    const campusId = await resolveWorkspaceCampus(user, requestedCampusId);
    if (!campusId) throw new SchoolAiError("Choose a campus.", 400, "CAMPUS_REQUIRED");
    const where = scope(user, campusId);
    const [invoices, payments, students, accounts, banks, ledger, years] = await Promise.all([
      prisma.invoice.findMany({ where: { ...where, status: { not: "CANCELLED" } }, include: { student: { select: { fullName: true } } }, orderBy: [{ invoiceDate: "desc" }, { id: "asc" }], take: 201 }),
      prisma.payment.findMany({ where: { ...where, amount: { gt: 0 }, reversalOfId: null }, include: { student: { select: { fullName: true } } }, orderBy: [{ paymentDate: "desc" }, { id: "asc" }], take: 201 }),
      prisma.student.findMany({ where: { ...where, archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { id: "asc" }, take: 201 }),
      prisma.chartOfAccount.findMany({ where: { ...where, type: "EXPENSE" }, orderBy: { name: "asc" }, take: 201 }),
      prisma.bankAccount.findMany({ where: { ...where, isActive: true }, orderBy: { name: "asc" }, take: 201 }),
      prisma.ledgerEntry.findMany({ where: { ...where, bankAccountId: { not: null } }, orderBy: [{ date: "desc" }, { id: "asc" }], take: 501 }),
      prisma.academicCycle.findMany({ where: { ...where, status: { in: ["DRAFT", "ACTIVE"] } }, orderBy: { academicYear: "desc" }, take: 30 }),
    ]);
    return { campusId, invoices: invoices.slice(0, 200).map(row => ({ id: row.id, label: `${row.student.fullName} · ${row.invoiceNumber || row.id}`, currency: row.currency, balance: row.balanceDue })), payments: payments.slice(0, 200).map(row => ({ id: row.id, label: `${row.student.fullName} · ${row.receiptNo || row.id}`, currency: row.currency })), students: students.slice(0, 200).map(row => ({ id: row.id, label: `${row.fullName} · ${row.rollNo}` })), accounts: accounts.slice(0, 200).map(row => ({ id: row.id, label: row.name })), banks: banks.slice(0, 200).map(row => ({ id: row.id, label: row.name, currency: row.currency })), ledger: ledger.slice(0, 500).map(row => ({ id: row.id, label: row.sourceName, date: day(row.date), amount: row.kind === "EXPENSE" ? -row.amount : row.amount, bankAccountId: row.bankAccountId!, currency: row.currency })), academicYears: years.map(row => row.academicYear), truncated: [invoices, payments, students, accounts, banks].some(rows => rows.length > 200) || ledger.length > 500 };
  });
}
async function invoiceSource(user: AuthUser, campusId: string, invoiceId: string, currency: string, db: TxClient) {
  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, ...scope(user, campusId) }, include: { student: { select: { fullName: true } }, paymentAllocations: true } });
  if (!invoice || invoice.status === "CANCELLED") return fail("FINANCE_TARGET_UNAVAILABLE");
  if (invoice.currency !== currency) return fail("FINANCE_CURRENCY");
  const allocated = invoice.paymentAllocations.reduce((sum, row) => sum + row.amount, 0);
  if (invoice.totalAmountPaid + invoice.balanceDue !== invoice.totalAmount || allocated !== invoice.totalAmountPaid || invoice.paymentAllocations.some(row => row.currency !== currency)) return fail("FINANCE_RECONCILIATION_REQUIRED");
  return invoice;
}
async function refundSource(user: AuthUser, campusId: string, proposal: Extract<FinanceOperationProposal, { action: "REFUND" }>, db: TxClient) {
  const payment = await db.payment.findFirst({ where: { id: proposal.paymentId, ...scope(user, campusId), reversalOfId: null, amount: { gt: 0 } }, include: { ledgerEntry: true, reversals: true, student: { select: { fullName: true } } } });
  if (!payment || !payment.ledgerEntry) return fail("FINANCE_TARGET_UNAVAILABLE");
  if (payment.currency !== proposal.currency || payment.ledgerEntry.currency !== proposal.currency) return fail("FINANCE_CURRENCY");
  const invoice = await invoiceSource(user, campusId, payment.invoiceId, proposal.currency, db);
  const allocations = await db.paymentAllocation.findMany({ where: { ...scope(user, campusId), paymentId: { in: [payment.id, ...payment.reversals.map(row => row.id)] } }, orderBy: { id: "asc" } });
  const allocated = allocations.reduce((sum, row) => sum + row.amount, 0), credit = allocations.reduce((sum, row) => sum + row.credit, 0), remaining = payment.amount + payment.reversals.reduce((sum, row) => sum + row.amount, 0);
  if (allocations.some(row => row.invoiceId !== invoice.id || row.currency !== proposal.currency) || allocated + credit !== remaining || allocated < 0 || credit < 0) return fail("FINANCE_RECONCILIATION_REQUIRED");
  if (proposal.invoiceAmount > allocated || proposal.invoiceAmount > invoice.totalAmountPaid || proposal.creditAmount > credit) return fail("FINANCE_REFUND_EXCEEDS");
  const carry = await db.feeCarryForward.findFirst({ where: { ...scope(user, campusId), studentId: payment.studentId, toAcademicYear: payment.paymentDate.getUTCFullYear() + 1 } });
  if (proposal.creditAmount && (!carry || carry.currency !== proposal.currency || carry.balance > -proposal.creditAmount)) return fail("FINANCE_CREDIT_CONSUMED");
  if (proposal.date < day(payment.paymentDate)) return fail("FINANCE_DATE");
  return { payment, invoice, allocations, allocated, credit, remaining, carry };
}

export async function previewFinanceOperations(user: AuthUser, record: RecordWithCampus, db: TxClient): Promise<FinanceOperationsPreview> {
  await assertFinanceOperationsAccess(user, db); await resolveWorkspaceCampus(user, record.campusId, db);
  const parsed = financeOperationProposalSchema.safeParse((record.data as { proposal?: unknown }).proposal);
  if (!parsed.success) return fail("FINANCE_PROPOSAL");
  const proposal = parsed.data, where = scope(user, record.campusId), effects: FinanceEffect[] = [], evidence: FinanceOperationsPreview["evidence"] = [];
  let target = "", facts: unknown, separateApprover = false;
  if (proposal.action === "PAYMENT" || proposal.action === "CREDIT") {
    const invoice = await invoiceSource(user, record.campusId, proposal.invoiceId, proposal.currency, db);
    target = `${invoice.student.fullName} · ${invoice.invoiceNumber || invoice.id}`; evidence.push({ id: invoice.id, label: target }); facts = invoice;
    if (proposal.action === "CREDIT") {
      if (proposal.amount > invoice.balanceDue || invoice.discountAmount + proposal.amount > 2147483647) return fail("FINANCE_CREDIT_EXCEEDS");
      effects.push({ label: "balance", before: invoice.balanceDue, after: invoice.balanceDue - proposal.amount }, { label: "total", before: invoice.totalAmount, after: invoice.totalAmount - proposal.amount }, { label: "discount", before: invoice.discountAmount, after: invoice.discountAmount + proposal.amount });
    } else {
      if (proposal.date < day(invoice.invoiceDate)) return fail("FINANCE_DATE");
      const bank = proposal.bankAccountId ? await db.bankAccount.findFirst({ where: { id: proposal.bankAccountId, ...where, isActive: true } }) : null;
      if (proposal.bankAccountId && !bank) return fail("FINANCE_TARGET_UNAVAILABLE");
      if (bank && bank.currency !== proposal.currency) return fail("FINANCE_CURRENCY");
      if (bank) await assertBankPeriodOpen(db, user.schoolId, record.campusId, bank.id, at(proposal.date));
      const duplicate = await db.payment.findFirst({ where: { ...where, referenceNumber: proposal.reference } });
      if (duplicate) return fail("FINANCE_DUPLICATE_REFERENCE");
      const applied = Math.min(proposal.amount, invoice.balanceDue), credit = proposal.amount - applied;
      const carry = await db.feeCarryForward.findFirst({ where: { ...where, studentId: invoice.studentId, toAcademicYear: at(proposal.date).getUTCFullYear() + 1 } });
      if (credit && carry && carry.currency !== proposal.currency) return fail("FINANCE_CURRENCY");
      if (credit && carry && carry.balance - credit < -2147483648) return fail("FINANCE_AMOUNT_LIMIT");
      effects.push({ label: "cash", after: proposal.amount }, { label: "paid", before: invoice.totalAmountPaid, after: invoice.totalAmountPaid + applied }, { label: "balance", before: invoice.balanceDue, after: invoice.balanceDue - applied }, { label: "credit", before: carry?.balance || 0, after: (carry?.balance || 0) - credit }); facts = { invoice, carry, bank };
    }
  } else if (proposal.action === "REFUND") {
    const loaded = await refundSource(user, record.campusId, proposal, db), policy = await db.school.findUniqueOrThrow({ where: { id: user.schoolId }, select: { correctionSeparateApprover: true } });
    if (loaded.payment.ledgerEntry?.bankAccountId) await assertBankPeriodOpen(db, user.schoolId, record.campusId, loaded.payment.ledgerEntry.bankAccountId, at(proposal.date));
    separateApprover = policy.correctionSeparateApprover;
    const author = await db.schoolAiRevision.findFirst({ where: { recordId: record.id, schoolId: user.schoolId, action: { in: ["CREATE", "SAVE", "RESTORE"] } }, orderBy: { version: "desc" }, select: { actorId: true } });
    if (separateApprover && (!author || author.actorId === record.approvedById)) return fail("FINANCE_SEPARATE_APPROVER");
    const duplicate = await db.payment.findFirst({ where: { ...where, referenceNumber: proposal.reference } }); if (duplicate) return fail("FINANCE_DUPLICATE_REFERENCE");
    target = `${loaded.payment.student.fullName} · ${loaded.payment.receiptNo || loaded.payment.id}`; evidence.push({ id: loaded.payment.id, label: target }, { id: loaded.invoice.id, label: loaded.invoice.invoiceNumber || loaded.invoice.id });
    effects.push({ label: "cash", after: -proposal.invoiceAmount - proposal.creditAmount }, { label: "paid", before: loaded.invoice.totalAmountPaid, after: loaded.invoice.totalAmountPaid - proposal.invoiceAmount }, { label: "balance", before: loaded.invoice.balanceDue, after: loaded.invoice.balanceDue + proposal.invoiceAmount }, { label: "credit", before: loaded.carry?.balance || 0, after: (loaded.carry?.balance || 0) + proposal.creditAmount }); facts = { loaded, policy };
  } else if (proposal.action === "OPENING_BALANCE") {
    const student = await db.student.findFirst({ where: { id: proposal.studentId, ...where, archivedAt: null }, select: { id: true, fullName: true } }), cycle = await db.academicCycle.findFirst({ where: { ...where, academicYear: proposal.academicYear, status: { in: ["DRAFT", "ACTIVE"] } } });
    if (!student || !cycle) return fail("FINANCE_TARGET_UNAVAILABLE");
    const carry = await db.feeCarryForward.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, toAcademicYear: proposal.academicYear } });
    const bills = await db.invoice.findFirst({ where: { ...where, studentId: student.id, enrollment: { academicYear: proposal.academicYear } } });
    if (carry || bills) return fail("FINANCE_OPENING_EXISTS");
    target = `${student.fullName} · ${proposal.academicYear}`; evidence.push({ id: student.id, label: student.fullName }, { id: cycle.id, label: cycle.label }); effects.push({ label: "opening", before: 0, after: proposal.amount }); facts = { student, cycle };
  } else if (proposal.action === "EXPENSE") {
    const account = await db.chartOfAccount.findFirst({ where: { id: proposal.accountId, ...where, type: "EXPENSE" } }), bank = proposal.bankAccountId ? await db.bankAccount.findFirst({ where: { id: proposal.bankAccountId, ...where, isActive: true } }) : null;
    if (!account || proposal.bankAccountId && !bank) return fail("FINANCE_TARGET_UNAVAILABLE");
    if (bank && bank.currency !== proposal.currency) return fail("FINANCE_CURRENCY");
    if (bank) await assertBankPeriodOpen(db, user.schoolId, record.campusId, bank.id, at(proposal.date));
    const existing = await db.ledgerEntry.findFirst({ where: { ...where, sourceName: proposal.reference } }); if (existing) return fail("FINANCE_DUPLICATE_REFERENCE");
    target = `${proposal.sourceName} · ${account.name}`; evidence.push({ id: account.id, label: account.name }); if (bank) evidence.push({ id: bank.id, label: bank.name }); effects.push({ label: "expense", after: proposal.amount }, { label: "cash", after: -proposal.amount }); facts = { account, bank };
  } else if (proposal.action === "RECONCILE") {
    const bank = await db.bankAccount.findFirst({ where: { id: proposal.bankAccountId, ...where, isActive: true } }); if (!bank) return fail("FINANCE_TARGET_UNAVAILABLE"); if (bank.currency !== proposal.currency) return fail("FINANCE_CURRENCY");
    const entries = await db.ledgerEntry.findMany({ where: { ...where, bankAccountId: bank.id, date: { gte: at(proposal.from), lt: new Date(at(proposal.to).getTime() + 86400000) } }, orderBy: { id: "asc" }, take: 101 });
    if (entries.length !== proposal.rows.length || entries.some(entry => { const row = proposal.rows.find(item => item.ledgerId === entry.id); return !row || row.date !== day(entry.date) || row.amount !== (entry.kind === "EXPENSE" ? -entry.amount : entry.amount) || entry.currency !== proposal.currency; })) return fail("FINANCE_STATEMENT_MISMATCH");
    const previous = await db.bankReconciliation.findMany({ where: { ...where, bankAccount: bank.id, status: "reconciled", statementPeriodFrom: { lte: at(proposal.to) }, statementPeriodTo: { gte: at(proposal.from) } }, select: { id: true } }); if (previous.length) return fail("FINANCE_STATEMENT_EXISTS");
    target = `${bank.name} · ${proposal.from} – ${proposal.to}`; evidence.push(...entries.map(entry => ({ id: entry.id, label: entry.sourceName }))); effects.push({ label: "opening", after: proposal.openingBalance }, { label: "closing", after: proposal.closingBalance }, { label: "matched", after: entries.length, count: true }); facts = { bank, entries };
  } else {
    const interval = { gte: at(proposal.from), lt: new Date(at(proposal.to).getTime() + 86400000) }, [invoices, entries] = await Promise.all([
      db.invoice.findMany({ where: { ...where, currency: proposal.currency, status: { not: "CANCELLED" }, invoiceDate: interval }, orderBy: { id: "asc" }, take: 2001 }),
      db.ledgerEntry.findMany({ where: { ...where, currency: proposal.currency, date: interval }, orderBy: { id: "asc" }, take: 2001 }),
    ]);
    if (invoices.length > 2000 || entries.length > 2000) return fail("FINANCE_SCOPE_LIMIT");
    const billed = invoices.reduce((sum, row) => sum + row.totalAmount, 0), expense = entries.filter(row => row.kind === "EXPENSE").reduce((sum, row) => sum + row.amount, 0), income = entries.filter(row => row.kind === "INCOME").reduce((sum, row) => sum + row.amount, 0), days = (at(proposal.to).getTime() - at(proposal.from).getTime()) / 86400000 + 1;
    const forecast = projectRevenue(billed, expense, days, proposal); target = `${proposal.from} – ${proposal.to} · ${proposal.months}`;
    effects.push({ label: "billed", after: billed }, { label: "income", after: income }, { label: "expense", after: expense }, { label: "overdue", after: invoices.filter(row => day(row.dueDate) < proposal.to && row.balanceDue > 0).length, count: true }, ...Object.entries(forecast).map(([label, after]) => ({ label: label as FinanceEffect["label"], after })));
    evidence.push(...invoices.map(row => ({ id: row.id, label: row.invoiceNumber || row.id })), ...entries.map(row => ({ id: row.id, label: row.sourceName }))); facts = { invoices, entries };
  }
  const value = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, action: proposal.action, currency: proposal.currency, target, reason: proposal.reason, effects, evidence, proposal, separateApprover };
  return { ...value, previewHash: workspaceRequestHash(json({ value, facts })) };
}

/** Call only within the common approved-version executor and campus fence. */
export async function applyFinanceOperations(user: AuthUser, record: RecordWithCampus, preview: FinanceOperationsPreview, db: TxClient): Promise<FinanceOperationsResult> {
  await assertFinanceOperationsAccess(user, db);
  const p = preview.proposal, where = scope(user, record.campusId), createdIds: string[] = [];
  if (p.action === "PAYMENT") {
    const invoice = await invoiceSource(user, record.campusId, p.invoiceId, p.currency, db);
    const result = await recordPayment(db, { campusId: record.campusId, invoiceId: invoice.id, studentId: invoice.studentId, amount: p.amount, paymentDate: at(p.date), paymentMethod: p.method, referenceNumber: p.reference, note: p.reason, recordedBy: user.userId }); if (p.bankAccountId) await db.ledgerEntry.update({ where: { paymentId: result.payment.id }, data: { bankAccountId: p.bankAccountId } });
    createdIds.push(result.payment.id);
  } else if (p.action === "CREDIT") {
    const invoice = await invoiceSource(user, record.campusId, p.invoiceId, p.currency, db);
    const total = invoice.totalAmount - p.amount, balance = invoice.balanceDue - p.amount;
    await db.invoice.update({ where: { id: invoice.id }, data: { totalAmount: total, balanceDue: balance, discountAmount: invoice.discountAmount + p.amount, status: balance === 0 ? "PAID" : invoice.totalAmountPaid > 0 ? "PARTIAL" : "PENDING" } }); createdIds.push(invoice.id);
  } else if (p.action === "REFUND") {
    const { payment, invoice, carry } = await refundSource(user, record.campusId, p, db);
    await capturePaymentReceipt(db, payment.id);
    const reversal = await db.payment.create({ data: { ...where, studentId: payment.studentId, invoiceId: payment.invoiceId, amount: -p.invoiceAmount - p.creditAmount, currency: p.currency, paymentDate: at(p.date), paymentMethod: payment.paymentMethod, referenceNumber: p.reference, receiptNo: `AI-REF-${record.id}-${record.version}`, reversalOfId: payment.id, recordedBy: user.userId, note: p.reason } });
    await db.paymentAllocation.create({ data: { ...where, paymentId: reversal.id, invoiceId: invoice.id, amount: -p.invoiceAmount, credit: -p.creditAmount, currency: p.currency } });
    const paid = invoice.totalAmountPaid - p.invoiceAmount, balance = invoice.balanceDue + p.invoiceAmount;
    await db.invoice.update({ where: { id: invoice.id }, data: { totalAmountPaid: paid, balanceDue: balance, status: balance === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING" } });
    if (p.creditAmount && carry) await db.feeCarryForward.update({ where: { id: carry.id }, data: { balance: { increment: p.creditAmount } } });
    await db.ledgerEntry.create({ data: { ...where, kind: "INCOME", accountId: payment.ledgerEntry!.accountId, bankAccountId: payment.ledgerEntry!.bankAccountId, sourceName: reversal.receiptNo!, amount: reversal.amount, currency: p.currency, date: at(p.date), paymentMethod: payment.paymentMethod, paymentId: reversal.id, createdById: user.userId, note: p.reason } });
    await capturePaymentReceipt(db, reversal.id); createdIds.push(reversal.id);
  } else if (p.action === "OPENING_BALANCE") {
    const carry = await db.feeCarryForward.create({ data: { ...where, studentId: p.studentId, fromAcademicYear: p.academicYear - 1, toAcademicYear: p.academicYear, currency: p.currency, balance: p.amount, note: `${p.sourceReference}\n${p.reason}` } }); createdIds.push(carry.id);
  } else if (p.action === "EXPENSE") {
    const entry = await db.ledgerEntry.create({ data: { ...where, kind: "EXPENSE", sourceName: p.reference, accountId: p.accountId, bankAccountId: p.bankAccountId, amount: p.amount, currency: p.currency, date: at(p.date), note: `${p.sourceName}\n${p.reason}`, createdById: user.userId } }); createdIds.push(entry.id);
  } else if (p.action === "RECONCILE") {
    const reconciliation = await db.bankReconciliation.create({ data: { ...where, bankAccount: p.bankAccountId, importDate: new Date(), statementPeriodFrom: at(p.from), statementPeriodTo: at(p.to), totalTransactions: p.rows.length, matchedCount: p.rows.length, unmatchedCount: 0, reconciliationDetailsJson: json({ currency: p.currency, openingBalance: p.openingBalance, closingBalance: p.closingBalance, rows: p.rows, workspaceId: record.id, version: record.version }), unmatchedJson: [], status: "reconciled", reconciledBy: user.userId, reconciledAt: new Date() } }); createdIds.push(reconciliation.id);
  }
  const result = { action: p.action, currency: p.currency, target: preview.target, effects: preview.effects, evidence: preview.evidence, createdIds };
  await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_finance_operations", recordId: record.id, userId: user.userId, oldValue: Prisma.DbNull, newValue: json({ operation: preview.operation, version: record.version, previewHash: preview.previewHash, proposal: p, result }) } });
  return result;
}
