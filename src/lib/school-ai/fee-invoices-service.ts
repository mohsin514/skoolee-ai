import { createHash } from "node:crypto";
import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { getLocalePackage } from "@/lib/locale/store";
import { minorUnits } from "@/lib/locale/package";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { calculateInvoiceAmounts, feeInvoiceProposalSchema, invoiceMonthDates, type FeeInvoiceOptions, type FeeInvoicePreview, type FeeInvoiceResult, type FeeInvoiceStudent, type InvoiceDiscount, type InvoiceFeeLine } from "./fee-invoices";

export async function assertFeeInvoiceAccess(user: AuthUser, db: TxClient = prisma) {
  assertApprovalRole(user);
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new SchoolAiError("Your account access changed. Sign in again.", 403, "PERMISSION_DENIED");
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, "edit", permissions);
  await assertWorkspacePermission(user, "fees", "view", permissions);
  await assertWorkspacePermission(user, "fees", "add", permissions);
  await assertSchoolOperational(user.schoolId, db);
}
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const className = (value: { name: string; section: string | null; academicYear: number }) => [value.name, value.section, value.academicYear].filter(Boolean).join(" · ");
const linesFor = (rows: Array<{ id: string; amount: number; dueDate: Date | null; feeType: { name: string; code: string } }>): InvoiceFeeLine[] => rows.map(line => ({ id: line.id, amount: line.amount, dueDate: line.dueDate ? dateString(line.dueDate) : null, name: line.feeType.name, code: line.feeType.code }));

export async function getFeeInvoiceOptions(user: AuthUser, requestedCampusId?: string | null, classId?: string | null): Promise<FeeInvoiceOptions> {
  return runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, async () => {
    await assertFeeInvoiceAccess(user);
    const campusId = await resolveWorkspaceCampus(user, requestedCampusId);
    if (!campusId) throw new SchoolAiError("Choose a campus.", 400, "CAMPUS_REQUIRED");
    const classes = await prisma.class.findMany({ where: { schoolId: user.schoolId, campusId, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { id: "asc" }], take: 501 });
    if (classes.length > 500) throw new SchoolAiError("Narrow the class scope.", 422, "FEE_SCOPE_LIMIT");
    const selected = classes.find(item => item.id === classId);
    if (classId && !selected) throw new SchoolAiError("Class unavailable.", 404, "FEE_CLASS_UNAVAILABLE");
    if (!selected) return { campusId, classes: classes.map(item => ({ id: item.id, name: className(item), academicYear: item.academicYear })), groups: [], students: [] };
    const [students, assignments] = await Promise.all([
      prisma.student.findMany({ where: { schoolId: user.schoolId, campusId, classId: selected.id, archivedAt: null, status: { equals: "active", mode: "insensitive" } }, select: { id: true, fullName: true, rollNo: true }, orderBy: [{ rollNo: "asc" }, { id: "asc" }], take: 501 }),
      prisma.feeGroupAssignment.findMany({ where: { schoolId: user.schoolId, campusId, classId: selected.id, academicYear: selected.academicYear }, include: { feeGroup: { include: { lines: { include: { feeType: true }, orderBy: { id: "asc" } } } } }, orderBy: { id: "asc" }, take: 51 }),
    ]);
    if (students.length > 500 || assignments.length > 50) throw new SchoolAiError("Narrow the fee scope before previewing.", 422, "FEE_SCOPE_LIMIT");
    return { campusId, classes: classes.map(item => ({ id: item.id, name: className(item), academicYear: item.academicYear })), students: students.map(item => ({ id: item.id, name: item.fullName, rollNo: item.rollNo })), groups: assignments.filter(item => item.feeGroup.schoolId === user.schoolId && item.feeGroup.campusId === campusId && item.feeGroup.lines.every(line => line.schoolId === user.schoolId && line.campusId === campusId && line.feeType.schoolId === user.schoolId && line.feeType.campusId === campusId)).map(item => ({ id: item.feeGroup.id, name: item.feeGroup.name, currency: item.feeGroup.currency, academicYear: item.academicYear, lines: linesFor(item.feeGroup.lines) })) };
  });
}

export async function previewFeeInvoices(user: AuthUser, record: SchoolAiRecord & { campusId: string }, db: TxClient): Promise<FeeInvoicePreview> {
  await assertFeeInvoiceAccess(user, db);
  await resolveWorkspaceCampus(user, record.campusId, db);
  const parsed = feeInvoiceProposalSchema.safeParse((record.data as { proposal?: unknown }).proposal);
  if (!parsed.success) throw new SchoolAiError("Save a complete fee invoice proposal.", 422, "FEE_PROPOSAL_REQUIRED");
  const proposal = parsed.data, { start, end } = invoiceMonthDates(proposal.billingMonth);
  const [cls, cycle, assignment] = await Promise.all([
    db.class.findFirst({ where: { id: proposal.classId, schoolId: user.schoolId, campusId: record.campusId, academicYear: proposal.academicYear, archivedAt: null, status: "ACTIVE" }, select: { id: true, name: true, section: true, academicYear: true } }),
    db.academicCycle.findFirst({ where: { schoolId: user.schoolId, campusId: record.campusId, academicYear: proposal.academicYear }, select: { id: true, status: true, startDate: true, endDate: true } }),
    db.feeGroupAssignment.findFirst({ where: { schoolId: user.schoolId, campusId: record.campusId, classId: proposal.classId, academicYear: proposal.academicYear, feeGroupId: proposal.feeGroupId }, include: { feeGroup: { include: { lines: { include: { feeType: true }, orderBy: { id: "asc" } } } } } }),
  ]);
  if (!cls) throw new SchoolAiError("The selected class or academic year changed.", 409, "FEE_CLASS_UNAVAILABLE");
  if (!cycle || cycle.status !== "ACTIVE" || cycle.startDate && dateString(start) < dateString(cycle.startDate) || cycle.endDate && proposal.dueDate > dateString(cycle.endDate)) throw new SchoolAiError("The billing dates must be inside an active academic cycle.", 409, "FEE_CYCLE_SCOPE");
  if (!assignment || assignment.feeGroup.schoolId !== user.schoolId || assignment.feeGroup.campusId !== record.campusId) throw new SchoolAiError("The selected fee package is not assigned to this class and academic year.", 409, "FEE_GROUP_UNAVAILABLE");
  const currency = assignment.feeGroup.currency;
  try { minorUnits(currency); } catch { throw new SchoolAiError("Review the fee currency.", 422, "FEE_CURRENCY_CONFLICT"); }
  const selectedLines = assignment.feeGroup.lines.filter(line => proposal.feeLineIds.includes(line.id));
  if (selectedLines.length !== proposal.feeLineIds.length || selectedLines.some(line => line.schoolId !== user.schoolId || line.campusId !== record.campusId || line.feeType.schoolId !== user.schoolId || line.feeType.campusId !== record.campusId)) throw new SchoolAiError("A selected fee line changed or is outside this package.", 409, "FEE_LINES_CHANGED");
  const lines = linesFor(selectedLines);
  if (lines.some(line => line.dueDate && line.dueDate.slice(0, 7) !== proposal.billingMonth)) throw new SchoolAiError("Dated fee lines must belong to the selected billing month.", 409, "FEE_LINE_PERIOD");
  try { calculateInvoiceAmounts(lines, [], currency); } catch { throw new SchoolAiError("Review the configured integer fee amounts.", 422, "FEE_INVALID_AMOUNT"); }
  const [students, invoices, carries, discounts, explicit] = await Promise.all([
    db.student.findMany({ where: { id: { in: proposal.studentIds }, schoolId: user.schoolId, campusId: record.campusId, classId: cls.id, archivedAt: null, status: { equals: "active", mode: "insensitive" } }, select: { id: true, fullName: true, rollNo: true, categoryId: true }, orderBy: { id: "asc" } }),
    db.invoice.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, studentId: { in: proposal.studentIds }, invoiceDate: { gte: start, lt: end } }, select: { id: true, studentId: true, invoiceDate: true, status: true, totalAmount: true, currency: true }, orderBy: { id: "asc" }, take: 501 }),
    db.feeCarryForward.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, studentId: { in: proposal.studentIds }, toAcademicYear: proposal.academicYear }, orderBy: { id: "asc" } }),
    db.feeDiscount.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId }, orderBy: { id: "asc" }, take: 1001 }),
    db.feeDiscountAssignment.findMany({ where: { schoolId: user.schoolId, studentId: { in: proposal.studentIds }, student: { campusId: record.campusId } }, select: { studentId: true, discountId: true }, orderBy: [{ studentId: "asc" }, { discountId: "asc" }], take: 5001 }),
  ]);
  if (invoices.length > 500 || discounts.length > 1000 || explicit.length > 5000) throw new SchoolAiError("Narrow the fee scope.", 422, "FEE_SCOPE_LIMIT");
  const rows: FeeInvoiceStudent[] = proposal.studentIds.slice().sort().map(studentId => {
    const student = students.find(item => item.id === studentId);
    const row: FeeInvoiceStudent = { studentId, name: student?.fullName ?? "", rollNo: student?.rollNo ?? "", disposition: "EXCLUDED", existingInvoiceIds: [], discounts: [], monthlyFee: 0, oneTimeFees: 0, subtotal: 0, discountAmount: 0, totalAmount: 0 };
    if (!student) return { ...row, reason: "FEE_STUDENT_UNAVAILABLE" };
    row.existingInvoiceIds = invoices.filter(item => item.studentId === studentId).map(item => item.id);
    if (row.existingInvoiceIds.length) return { ...row, reason: "FEE_ALREADY_INVOICED" };
    const carry = carries.find(item => item.studentId === studentId);
    if (carry && carry.balance !== 0) return { ...row, reason: "FEE_CARRY_FORWARD_REVIEW" };
    const explicitIds = explicit.filter(item => item.studentId === studentId).map(item => item.discountId);
    if (explicitIds.some(id => !discounts.some(item => item.id === id))) return { ...row, reason: "FEE_INVALID_AMOUNT" };
    const applicable = discounts.filter(item => student.categoryId && item.categoryId === student.categoryId || explicitIds.includes(item.id));
    row.discounts = applicable.map(item => ({ id: item.id, name: item.name, code: item.code, type: item.type as InvoiceDiscount["type"], value: item.value, currency: item.currency, source: student.categoryId && item.categoryId === student.categoryId ? "CATEGORY" : "EXPLICIT" }));
    try {
      const amounts = calculateInvoiceAmounts(lines, row.discounts, currency);
      return { ...row, ...amounts, ...(amounts.totalAmount === 0 ? { reason: "FEE_ZERO_BALANCE" as const } : { disposition: "CREATE" as const }) };
    } catch (error) { return { ...row, reason: error instanceof Error && error.message === "FEE_CURRENCY_CONFLICT" ? "FEE_CURRENCY_CONFLICT" : "FEE_INVALID_AMOUNT" }; }
  });
  const createdCount = rows.filter(row => row.disposition === "CREATE").length;
  const localeSnapshot = { ...await getLocalePackage(user.schoolId, record.campusId, start, undefined, db), currency } as FeeInvoicePreview["localeSnapshot"];
  const value = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, classId: cls.id, className: className(cls), academicYear: proposal.academicYear, feeGroupId: assignment.feeGroupId, feeGroupName: assignment.feeGroup.name, billingMonth: proposal.billingMonth, invoiceDate: dateString(start), dueDate: proposal.dueDate, currency, localeSnapshot, lines, students: rows, createdCount, skippedCount: rows.length - createdCount, totalAmount: rows.filter(row => row.disposition === "CREATE").reduce((sum, row) => sum + row.totalAmount, 0), blockers: createdCount ? [] : ["FEE_EMPTY_BATCH" as const] };
  return { ...value, previewHash: workspaceRequestHash(JSON.parse(JSON.stringify({ preview: value, proposal, cycle, assignment, students, invoices, carries, discounts, explicit }))) };
}

/** Called only after the campus fence and exact approved-preview recheck. */
export async function applyFeeInvoices(user: AuthUser, preview: FeeInvoicePreview, db: TxClient): Promise<FeeInvoiceResult> {
  await assertFeeInvoiceAccess(user, db);
  if (preview.blockers.length) throw new SchoolAiError("No eligible invoices remain in this preview.", 409, "FEE_EMPTY_BATCH");
  const invoiceIds: string[] = [], students: FeeInvoiceResult["students"] = [];
  for (const student of preview.students) {
    if (student.disposition !== "CREATE") { students.push(student); continue; }
    const id = createHash("sha256").update(`school-ai-invoice:${user.schoolId}:${preview.campusId}:${student.studentId}:${preview.billingMonth}`).digest("hex");
    const invoiceNumber = `AI-${preview.billingMonth}-${id.slice(0, 20).toUpperCase()}`;
    await db.invoice.create({ data: { id, schoolId: user.schoolId, campusId: preview.campusId, studentId: student.studentId, invoiceNumber, currency: preview.currency, localeSnapshot: preview.localeSnapshot, invoiceDate: new Date(`${preview.invoiceDate}T00:00:00.000Z`), dueDate: new Date(`${preview.dueDate}T00:00:00.000Z`), monthlyFee: student.monthlyFee, oneTimeFees: student.oneTimeFees, subtotal: student.subtotal, discountAmount: student.discountAmount, lateFeeAmount: 0, taxAmount: 0, totalAmount: student.totalAmount, totalAmountPaid: 0, balanceDue: student.totalAmount, status: "PENDING" } });
    await db.auditLog.create({ data: { schoolId: user.schoolId, tableName: "invoices", recordId: id, userId: user.userId, oldValue: Prisma.DbNull, newValue: { operation: preview.operation, workspaceId: preview.recordId, workspaceVersion: preview.version, previewHash: preview.previewHash, studentId: student.studentId, currency: preview.currency, subtotal: student.subtotal, discountAmount: student.discountAmount, totalAmount: student.totalAmount, lineIds: preview.lines.map(line => line.id), discountIds: student.discounts.map(discount => discount.id) } } });
    invoiceIds.push(id); students.push({ ...student, invoiceId: id, invoiceNumber });
  }
  return { invoiceIds, createdCount: invoiceIds.length, skippedCount: preview.skippedCount, currency: preview.currency, totalAmount: preview.totalAmount, billingMonth: preview.billingMonth, dueDate: preview.dueDate, lines: preview.lines, students };
}
