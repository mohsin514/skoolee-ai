import type { SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { examWeekday } from "@/lib/academic/exam-bookings";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { schoolAiTransaction } from "./transaction";
import { workspaceRequestHash } from "./repository";
import { riskDecisionProposalSchema, riskIndicatorSchema, riskModules, riskScopeSchema, type RiskDecisionPreview, type RiskEvidence, type RiskIndicator, type RiskOptions } from "./school-operations-risk";
const fail = (message: string, code = "SCHOOL_OPERATIONS_RISK", status = 409): never => { throw new SchoolAiError(message, status, code); };
export async function assertRiskAccess(user: AuthUser, campusId: string, indicator: RiskIndicator, tx: TxClient) {
  assertApprovalRole(user); await resolveWorkspaceCampus(user, campusId, tx);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && user.accessVersion !== actor.accessVersion) fail("Account access changed.", "PERMISSION_DENIED", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, tx); await assertSchoolAiAccess(user, "view", permissions);
  for (const permissionModule of riskModules(indicator)) await assertWorkspacePermission(user, permissionModule, "view", permissions);
  await assertSchoolOperational(user.schoolId, tx);
}
async function owners(user: AuthUser, campusId: string, indicator: RiskIndicator, tx: TxClient) {
  const users = await tx.user.findMany({ where: { schoolId: user.schoolId, isActive: true, OR: [{ campusId, role: { in: ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"] } }, { role: "SUPER_ADMIN" }] }, select: { id: true, fullName: true, role: true, campusId: true, email: true, accessVersion: true }, orderBy: { id: "asc" }, take: 101 });
  if (users.length > 100) fail("Narrow the accountable-owner scope.", "SCHOOL_OPERATIONS_LIMIT");
  const authorized = [];
  for (const owner of users) { try { await assertRiskAccess({ userId: owner.id, schoolId: user.schoolId, campusId: owner.campusId, role: owner.role, email: owner.email, accessVersion: owner.accessVersion }, campusId, indicator, tx); authorized.push(owner); } catch (error) { if (!(error instanceof SchoolAiError) || error.status !== 403) throw error; } }
  return authorized;
}
export async function getRiskOptions(user: AuthUser, campusId: string, rawIndicator: unknown): Promise<RiskOptions> {
  const indicator = riskIndicatorSchema.parse(rawIndicator);
  return schoolAiTransaction(user, async tx => {
    await assertRiskAccess(user, campusId, indicator, tx);
    const scope = { schoolId: user.schoolId, campusId };
    const [classes, cycles, availableOwners] = await Promise.all([tx.class.findMany({ where: { ...scope, archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { id: "asc" }], take: 501 }), tx.academicCycle.findMany({ where: scope, select: { id: true, label: true }, orderBy: { academicYear: "desc" }, take: 101 }), owners(user, campusId, indicator, tx)]);
    if (classes.length > 500 || cycles.length > 100) fail("Narrow the risk review scope.", "SCHOOL_OPERATIONS_LIMIT");
    const indicators: RiskIndicator[] = [];
    for (const candidate of riskIndicatorSchema.options) { try { await assertRiskAccess(user, campusId, candidate, tx); indicators.push(candidate); } catch (error) { if (!(error instanceof SchoolAiError) || error.status !== 403) throw error; } }
    return { classes: classes.map(cls => ({ id: cls.id, name: [cls.name, cls.section, cls.academicYear].filter(Boolean).join(" · ") })), cycles: cycles.map(cycle => ({ id: cycle.id, name: cycle.label })), owners: availableOwners.map(owner => ({ id: owner.id, name: owner.fullName })), indicators };
  });
}
export async function inspectRiskEvidence(user: AuthUser, raw: unknown): Promise<RiskEvidence> { const input = riskScopeSchema.parse(raw); return schoolAiTransaction(user, tx => riskEvidence(user, input, tx)); }
async function riskEvidence(user: AuthUser, input: { campusId: string; indicator: RiskIndicator; scopeId: string; date: string }, tx: TxClient): Promise<RiskEvidence> {
  await assertRiskAccess(user, input.campusId, input.indicator, tx);
  const scope = { schoolId: user.schoolId, campusId: input.campusId }, instant = new Date(`${input.date}T00:00:00Z`), locale = await getLocalePackage(user.schoolId, input.campusId, instant, undefined, tx), today = calendarDateIn(locale.timezone);
  if (input.indicator === "UNCOVERED_LESSONS" && input.date < today) fail("Choose today or a future lesson date.", "SCHOOL_OPERATIONS_DATE");
  if (input.indicator === "UNRELEASED_RESULTS" && input.date !== today) fail("Result evidence reflects the current review date.", "SCHOOL_OPERATIONS_DATE");
  if (input.indicator !== "UNCOVERED_LESSONS" && input.date > today) fail("Choose today or a past review date.", "SCHOOL_OPERATIONS_DATE");
  if (input.indicator !== "UNRELEASED_RESULTS") {
    const holiday = await tx.holiday.findFirst({ where: { ...scope, fromDate: { lte: instant }, toDate: { gte: instant } }, select: { id: true } });
    if (locale.weekend.map(day => day || 7).includes(examWeekday(input.date)) || holiday) fail("Choose a working school day.", "SCHOOL_OPERATIONS_CALENDAR");
  }
  let items: RiskEvidence["items"] = [], total = 0, scopeName = ""; let source: unknown;
  if (input.indicator === "ATTENDANCE_GAPS") {
    const cls = await tx.class.findFirst({ where: { ...scope, id: input.scopeId, archivedAt: null }, select: { id: true, name: true, section: true } }); if (!cls) fail("Choose a class in this campus.", "SCHOOL_OPERATIONS_SCOPE");
    const enrollments = await tx.studentEnrollment.findMany({ where: { ...scope, classId: input.scopeId, origin: { not: { startsWith: "LEGACY" } }, startDate: { lte: instant }, OR: [{ endDate: null }, { endDate: { gt: instant } }] }, select: { id: true, studentId: true, student: { select: { fullName: true, rollNo: true } } }, orderBy: { id: "asc" }, take: 501 });
    if (enrollments.length > 500) fail("Review a class with at most 500 enrollments.", "SCHOOL_OPERATIONS_LIMIT");
    const rows = await tx.attendance.findMany({ where: { ...scope, classId: input.scopeId, date: instant }, select: { id: true, enrollmentId: true, status: true, studentId: true }, orderBy: { id: "asc" } });
    items = enrollments.filter(row => !rows.some(mark => mark.enrollmentId === row.id && mark.studentId === row.studentId)).map(row => ({ id: row.id, label: row.student.fullName, detail: row.student.rollNo })); total = enrollments.length; scopeName = [cls!.name, cls!.section].filter(Boolean).join(" · "); source = { cls, enrollments, rows };
  } else if (input.indicator === "UNCOVERED_LESSONS") {
    const cls = await tx.class.findFirst({ where: { ...scope, id: input.scopeId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true } }); if (!cls) fail("Choose an active class in this campus.", "SCHOOL_OPERATIONS_SCOPE");
    const cycle = await tx.academicCycle.findFirst({ where: { ...scope, academicYear: cls!.academicYear }, select: { status: true, startDate: true, endDate: true } });
    if (cycle && (cycle.status === "ENDED" || cycle.startDate && instant < cycle.startDate || cycle.endDate && instant > cycle.endDate)) fail("Choose a date in the teaching year.", "SCHOOL_OPERATIONS_YEAR");
    const [slots, leave, duties] = await Promise.all([tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, dayOfWeek: examWeekday(input.date), slotType: "CLASS", timetable: { ...scope, classId: input.scopeId, status: "PUBLISHED" } }, select: { id: true, teacherId: true, startTime: true, endTime: true, subject: { select: { name: true } }, teacher: { select: { fullName: true } } }, orderBy: { id: "asc" }, take: 501 }), tx.leaveRequest.findMany({ where: { ...scope, status: "APPROVED", fromDate: { lt: new Date(instant.getTime() + 86400000) }, toDate: { gte: instant } }, select: { id: true, userId: true, fromDate: true, toDate: true }, orderBy: { id: "asc" } }), tx.schoolAiSubstituteDuty.findMany({ where: { ...scope, date: instant, status: "ASSIGNED" }, select: { id: true, timetableSlotId: true, teacherId: true, version: true }, orderBy: { id: "asc" } })]);
    if (slots.length > 500) fail("Narrow the lesson review.", "SCHOOL_OPERATIONS_LIMIT");
    items = slots.filter(slot => { const effective = duties.find(duty => duty.timetableSlotId === slot.id)?.teacherId ?? slot.teacherId; return !effective || leave.some(row => row.userId === effective); }).map(slot => ({ id: slot.id, label: slot.subject?.name ?? "", detail: `${slot.startTime}–${slot.endTime}` })); total = slots.length; scopeName = [cls!.name, cls!.section].filter(Boolean).join(" · "); source = { cls, cycle, slots, leave, duties };
  } else {
    const cycle = await tx.academicCycle.findFirst({ where: { ...scope, id: input.scopeId }, select: { id: true, label: true, academicYear: true } }); if (!cycle) fail("Choose a year in this campus.", "SCHOOL_OPERATIONS_SCOPE");
    const exams = await tx.exam.findMany({ where: { ...scope, academicYear: cycle!.academicYear }, select: { id: true, title: true, status: true, _count: { select: { reportCards: true } } }, orderBy: { id: "asc" }, take: 501 });
    if (exams.length > 500) fail("Review at most 500 exams.", "SCHOOL_OPERATIONS_LIMIT");
    items = exams.filter(exam => exam.status !== "PUBLISHED" || exam._count.reportCards === 0).map(exam => ({ id: exam.id, label: exam.title, detail: exam.status })); total = exams.length; scopeName = cycle!.label; source = { cycle, exams };
  }
  const result = { indicator: input.indicator, scopeId: input.scopeId, scopeName, date: input.date, count: items.length, total, items };
  return { ...result, evidenceHash: workspaceRequestHash({ campusId: input.campusId, result, source, weekend: locale.weekend }) };
}
export async function previewRiskDecision(user: AuthUser, record: SchoolAiRecord & { campusId: string }, tx: TxClient): Promise<RiskDecisionPreview> {
  const proposal = riskDecisionProposalSchema.parse((record.data as { proposal: unknown }).proposal), evidence = await riskEvidence(user, { ...proposal, campusId: record.campusId }, tx);
  if (evidence.evidenceHash !== proposal.evidenceHash) fail("Evidence changed. Refresh it and review a new version.", "SCHOOL_OPERATIONS_RISK_STALE");
  if (proposal.decision === "RESOLVE" && (evidence.count !== 0 || evidence.total === 0)) fail("Resolution requires a checked scope with no remaining items.", "SCHOOL_OPERATIONS_RISK_UNRESOLVED");
  const owner = (await owners(user, record.campusId, proposal.indicator, tx)).find(item => item.id === proposal.ownerId); if (!owner) fail("Choose an active manager with access to this evidence.", "SCHOOL_OPERATIONS_RISK_OWNER");
  const locale = await getLocalePackage(user.schoolId, record.campusId, new Date(), undefined, tx);
  if (proposal.decision !== "RESOLVE" && proposal.dueDate < calendarDateIn(locale.timezone)) fail("Choose today or a future date for the next review.", "SCHOOL_OPERATIONS_DATE");
  if (proposal.dueDate < proposal.date) fail("The next review must not precede the evidence date.", "SCHOOL_OPERATIONS_DATE");
  const riskKey = workspaceRequestHash({ campusId: record.campusId, indicator: proposal.indicator, scopeId: proposal.scopeId, date: proposal.date });
  const previous = await tx.auditLog.findMany({ where: { schoolId: user.schoolId, tableName: "school_ai_risk_decisions", recordId: riskKey }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 });
  const actors = await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: previous.map(row => row.userId) } }, select: { id: true, fullName: true } });
  const previousDecisions = previous.map(row => { const data = row.newValue as { decision: string; ownerName: string; dueDate: string; note: string; count: number }; return { id: row.id, actorName: actors.find(actor => actor.id === row.userId)?.fullName ?? row.userId, at: row.createdAt.toISOString(), ...data }; });
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, riskKey, evidence, ownerId: owner!.id, ownerName: owner!.fullName, dueDate: proposal.dueDate, decision: proposal.decision, note: proposal.note, previousDecisions };
  return { ...preview, previewHash: workspaceRequestHash({ preview, owner }) };
}
export async function applyRiskDecision(user: AuthUser, preview: RiskDecisionPreview, tx: TxClient) {
  const audit = await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "school_ai_risk_decisions", recordId: preview.riskKey, userId: user.userId, newValue: { recordId: preview.recordId, version: preview.version, indicator: preview.evidence.indicator, scopeId: preview.evidence.scopeId, date: preview.evidence.date, evidenceHash: preview.evidence.evidenceHash, count: preview.evidence.count, ownerId: preview.ownerId, ownerName: preview.ownerName, dueDate: preview.dueDate, decision: preview.decision, note: preview.note } }, select: { id: true } });
  return { operation: preview.operation, ids: [audit.id], count: 1 };
}
