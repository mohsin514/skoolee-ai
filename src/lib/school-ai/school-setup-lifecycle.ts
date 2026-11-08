import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { enrollmentImpact, withdrawalImpact } from "@/lib/students/enrollment";
import { assertFinanceOperationsAccess } from "./finance-operations-service";
import { SchoolAiError } from "./access";
import type { SchoolSetupProposal, SchoolSetupRowPreview } from "./school-setup";
const fail = (code: string) => { throw new SchoolAiError("Reconcile the source records and refresh this setup preview.", 409, code); };
export async function previewSetupEnrollment(user: AuthUser, campusId: string, proposal: Extract<SchoolSetupProposal, { action: "TRANSFERS" | "WITHDRAWALS" }>, db: TxClient) {
  const rows: SchoolSetupRowPreview[] = [], facts: unknown[] = [];
  for (const [index, row] of proposal.rows.entries()) {
    const pupil = await db.student.findFirst({ where: { id: row.studentId, schoolId: user.schoolId, campusId, archivedAt: null, status: "active", consolidatedIntoId: null }, include: { enrollments: { where: { status: "ACTIVE", endDate: null } } } });
    if (!pupil || pupil.enrollments.length !== 1) return fail("SETUP_STUDENT_UNAVAILABLE");
    const effectiveDate = new Date(row.effectiveFrom + "T00:00:00Z"), from = pupil.enrollments[0];
    if (proposal.action === "TRANSFERS") {
      const transfer = proposal.rows[index], impact = await enrollmentImpact(db, pupil.id, from.id, transfer.targetClassId, effectiveDate);
      if (impact.target.schoolId !== user.schoolId || user.role !== "SUPER_ADMIN" && impact.target.campusId !== campusId || impact.target.archivedAt || impact.target.id === pupil.classId) return fail("SETUP_TRANSFER_TARGET");
      const cycle = await db.academicCycle.findFirst({ where: { schoolId: user.schoolId, campusId: impact.target.campusId, academicYear: impact.target.academicYear, status: "ACTIVE" } });
      if (!cycle || cycle.startDate && effectiveDate < cycle.startDate || cycle.endDate && effectiveDate > cycle.endDate) return fail("SETUP_TRANSFER_TARGET");
      const occupancy = await db.student.count({ where: { schoolId: user.schoolId, campusId: impact.target.campusId, classId: impact.target.id, status: "active", archivedAt: null } });
      const incoming = proposal.rows.filter(item => item.targetClassId === transfer.targetClassId);
      if (incoming.some(item => item.verifiedCapacity !== transfer.verifiedCapacity) || occupancy + incoming.length > transfer.verifiedCapacity) return fail("SETUP_TRANSFER_CAPACITY");
      const rollConflict = await db.student.findFirst({ where: { schoolId: user.schoolId, campusId: impact.target.campusId, id: { not: pupil.id }, rollNo: transfer.rollNo, archivedAt: null } });
      if (rollConflict || proposal.rows.some((item, i) => i !== index && item.rollNo === transfer.rollNo)) return fail("SETUP_ROLL_CONFLICT");
      rows.push({ index, label: pupil.fullName, studentName: pupil.fullName, disposition: "TRANSFER", existingId: pupil.id, currentEnrollmentId: from.id, targetName: `${impact.target.campus.name} · ${impact.target.name} ${impact.target.section || ""}`, preserved: impact.preserved, targetOccupancy: occupancy }); facts.push({ pupil, impact, occupancy, cycle });
    } else { const impact = await withdrawalImpact(db, pupil.id, effectiveDate); rows.push({ index, label: pupil.fullName, studentName: pupil.fullName, disposition: "WITHDRAW", existingId: pupil.id, currentEnrollmentId: from.id, preserved: impact.preserved }); facts.push({ pupil, impact }); }
  }
  return { rows, facts };
}
export async function previewMigrationCutover(user: AuthUser, campusId: string, proposal: Extract<SchoolSetupProposal, { action: "MIGRATION_CUTOVER" }>, db: TxClient) {
  await assertFinanceOperationsAccess(user, db);
  const scope = { schoolId: user.schoolId, campusId }, sources = await db.schoolAiRecord.findMany({ where: { ...scope, id: { in: proposal.sourceIds }, kind: "SOURCE", status: "APPROVED" }, select: { id: true, version: true, title: true, status: true }, orderBy: { id: "asc" } });
  if (sources.length !== proposal.sourceIds.length) return fail("SETUP_MIGRATION_SOURCES");
  // A bounded exact manifest retains identities, balances and provenance; no
  // historic receipt or bank entry is copied into a second ledger.
  const [students, staff, pending, guardians, rooms, periods, invoices, carry, ledger, imports] = await Promise.all([
    db.student.findMany({ where: { ...scope, archivedAt: null, status: "active" }, select: { id: true, fullName: true, admissionNo: true, rollNo: true, classId: true, enrollmentDate: true }, orderBy: { id: "asc" }, take: 5001 }),
    db.user.findMany({ where: { ...scope, isActive: true, role: { notIn: ["STUDENT", "PARENT"] } }, select: { id: true, role: true, email: true, accessVersion: true }, orderBy: { id: "asc" }, take: 5001 }),
    db.staffInvitation.findMany({ where: { ...scope, status: "pending", role: { notIn: ["STUDENT", "PARENT"] } }, select: { id: true, role: true, email: true, expiresAt: true }, orderBy: { id: "asc" }, take: 5001 }),
    db.guardianRelationship.findMany({ where: { ...scope, status: { in: ["ACTIVE", "INVITED"] } }, select: { id: true, studentId: true, email: true, status: true, updatedAt: true, accessVersions: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" }, take: 5001 }),
    db.classRoom.findMany({ where: scope, orderBy: { id: "asc" }, take: 5001 }), db.periodDefinition.findMany({ where: scope, orderBy: { id: "asc" }, take: 5001 }),
    db.invoice.findMany({ where: { ...scope, status: { not: "CANCELLED" }, balanceDue: { not: 0 } }, select: { id: true, studentId: true, totalAmount: true, totalAmountPaid: true, balanceDue: true, currency: true, enrollmentId: true, paymentAllocations: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" }, take: 5001 }),
    db.feeCarryForward.findMany({ where: scope, orderBy: { id: "asc" }, take: 5001 }), db.ledgerEntry.findMany({ where: scope, select: { id: true, currency: true, kind: true, amount: true, date: true, bankAccountId: true, paymentId: true }, orderBy: { id: "asc" }, take: 5001 }),
    db.importBatch.findMany({ where: { ...scope, state: { in: ["COMMITTED", "PARTIAL"] } }, select: { id: true, fingerprint: true, sourceName: true, kind: true, state: true, committedAt: true }, orderBy: { id: "asc" }, take: 5001 }),
  ]);
  if ([students, staff, pending, guardians, rooms, periods, invoices, carry, ledger, imports].some(items => items.length > 5000)) return fail("SETUP_SCOPE_LIMIT");
  const duplicates = (values: string[]) => new Set(values.map(value => value.normalize("NFKC").trim().toLowerCase())).size !== values.length;
  if (imports.some(item => item.state === "PARTIAL") || invoices.some(item => item.totalAmountPaid + item.balanceDue !== item.totalAmount || item.paymentAllocations.reduce((sum, allocation) => sum + allocation.amount, 0) !== item.totalAmountPaid || item.paymentAllocations.some(allocation => allocation.currency !== item.currency)) || duplicates(students.map(item => item.rollNo)) || duplicates(students.map(item => item.admissionNo).filter((value): value is string => Boolean(value))) || duplicates([...staff, ...pending].map(item => item.email)) || duplicates(guardians.map(item => `${item.studentId}:${item.email}`))) return fail("SETUP_MIGRATION_UNRECONCILED");
  for (const [dataset, entries] of [["INVOICES_OPEN", invoices], ["LEDGER", ledger]] as const) if (entries.some(entry => !proposal.rows.some(row => row.dataset === dataset && row.currency === entry.currency))) return fail("SETUP_MIGRATION_COVERAGE");
  if (carry.some(entry => !proposal.rows.some(row => row.dataset === "OPENING_BALANCES" && row.currency === entry.currency && row.academicYear === entry.toAcademicYear))) return fail("SETUP_MIGRATION_COVERAGE");
  const counts = { STUDENTS: students.length, STAFF_ACTIVE: staff.length, STAFF_PENDING: pending.length, GUARDIANS: guardians.length, ROOMS: rooms.length, PERIODS: periods.length };
  const rows: SchoolSetupRowPreview[] = proposal.rows.map((row, index) => {
    const entries = row.dataset === "INVOICES_OPEN" ? invoices.filter(item => item.currency === row.currency) : row.dataset === "OPENING_BALANCES" ? carry.filter(item => item.currency === row.currency && item.toAcademicYear === row.academicYear) : row.dataset === "LEDGER" ? ledger.filter(item => item.currency === row.currency) : null;
    const actualCount = entries?.length ?? counts[row.dataset as keyof typeof counts], actualBalance = entries?.reduce((sum, item) => sum + ("balanceDue" in item ? item.balanceDue : "balance" in item ? item.balance : item.kind === "EXPENSE" ? -item.amount : item.amount), 0);
    return { index, label: row.dataset, disposition: "RECONCILE", reconciliation: { expectedCount: row.expectedCount, actualCount, ...(row.currency ? { currency: row.currency, expectedBalance: row.expectedBalance, actualBalance } : {}), matches: actualCount === row.expectedCount && (actualBalance === undefined || actualBalance === row.expectedBalance) } };
  });
  return { rows, facts: { sources, students, staff, pending, guardians, rooms, periods, invoices, carry, ledger, imports } };
}
