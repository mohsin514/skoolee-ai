import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, canLeadAcademics, canManageOperations } from "@/lib/api/scope";
import { applyEnrollment, applyWithdrawal, assertRegistrar, dateOnly } from "@/lib/students/enrollment";
import { calculateWeightedGrade } from "@/lib/academic/grade-calculator";
import { getYearClosureReport } from "@/lib/academic/year-closure";
import { notify } from "@/lib/notifications/in-app";

/**
 * SKO-404: year-end rollover as a reviewed, versioned plan.
 *
 * Every eligible learner gets exactly one decision row. Evidence is recorded
 * as PASSED / FAILED / MISSING, and MISSING is always NEEDS_REVIEW: an empty
 * result never becomes a pass, a fail or a silent exclusion. Any edit bumps the
 * plan version and withdraws approval; approval binds to that exact version.
 * Execution runs in bounded batches under a lease, revalidates placement,
 * duplicates and capacity per learner, and is safe to retry because each row
 * moves PENDING → DONE inside the same transaction as its enrollment change.
 */

export const DECISIONS = ["PROMOTE", "RETAIN", "GRADUATE", "TRANSFER_OUT", "NEEDS_REVIEW"] as const;
export type Decision = (typeof DECISIONS)[number];
type ClassMap = Record<string, { promote?: string | null; retain?: string | null }>;
type Baseline = { learners: number; balances: { currency: string; minor: number }[]; history: { attendance: number; reports: number; invoices: number } };

const LEASE_MS = 2 * 60_000;
const UNFINISHED_EXAM = ["DRAFT", "ACTIVE", "MARKS_ENTRY"];
const today = () => dateOnly(new Date().toISOString().slice(0, 10));
const classLabel = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(" - ");

export async function assertRolloverRead(user: AuthUser) {
  if (!canManageOperations(user)) throw new ApiError("Only authorized academic staff can review promotion", 403);
  await assertPermission(user, "students", "view");
}

async function event(db: TxClient, plan: { id: string; schoolId: string }, version: number, kind: string, actorId: string, detail?: object) {
  await db.rolloverEvent.create({ data: { schoolId: plan.schoolId, planId: plan.id, version, kind, actorId, detail: detail ?? undefined } });
}

/** Learners whose current placement is a class of the source year, in this campus. */
async function eligibleLearners(db: TxClient, campusId: string, sourceYear: number) {
  return db.student.findMany({
    where: { campusId, status: "active", archivedAt: null, consolidatedIntoId: null, class: { academicYear: sourceYear } },
    select: { id: true, fullName: true, rollNo: true, classId: true, enrollments: { where: { status: "ACTIVE", endDate: null }, select: { id: true }, take: 1 } },
    orderBy: [{ classId: "asc" }, { rollNo: "asc" }],
  });
}

async function evidenceFor(campusId: string, studentId: string, classId: string, year: number) {
  const exams = await prisma.exam.findMany({ where: { campusId, classId, academicYear: year, status: { notIn: UNFINISHED_EXAM } }, select: { id: true } });
  const marks = exams.length ? await prisma.mark.count({ where: { studentId, examId: { in: exams.map(e => e.id) } } }) : 0;
  if (!marks) return { evidence: "MISSING" as const, detail: { note: "No locked marks recorded for this year." } };
  try {
    const result = await calculateWeightedGrade(studentId, campusId, classId, year);
    return { evidence: result.passed ? "PASSED" as const : "FAILED" as const, detail: { percentage: Math.round(result.overallPercentage * 10) / 10, grade: result.overallGrade } };
  } catch (error) {
    return { evidence: "MISSING" as const, detail: { note: error instanceof Error ? error.message : "The result could not be calculated." } };
  }
}

async function getPlan(user: AuthUser, planId: string, db: TxClient = prisma) {
  const plan = await db.rolloverPlan.findFirst({ where: { id: planId, schoolId: user.schoolId } });
  if (!plan) throw new ApiError("Rollover plan not found", 404);
  if (user.role !== "SUPER_ADMIN" && plan.campusId !== user.campusId) throw new ApiError("Rollover plan not found", 404);
  return plan;
}

/** Edits withdraw approval and bump the version so approval can never cover changed decisions. */
async function bumpVersion(db: TxClient, plan: { id: string; schoolId: string; version: number; status: string; leaseUntil: Date | null }, actorId: string, kind: string, detail: object) {
  if (plan.status === "EXECUTING" && plan.leaseUntil && plan.leaseUntil > new Date()) throw new ApiError("A batch is running. Wait for it to pause before editing the plan.", 409);
  if (plan.status === "COMPLETED") throw new ApiError("This rollover is complete. Use a correction on an individual learner instead.", 409);
  const claimed = await db.rolloverPlan.updateMany({ where: { id: plan.id, version: plan.version }, data: { version: { increment: 1 }, status: "DRAFT", leaseUntil: null } });
  if (!claimed.count) throw new ApiError("The plan changed while you were editing. Reload and review again.", 409);
  const version = plan.version + 1;
  await event(db, plan, version, kind, actorId, { ...detail, ...(plan.status !== "DRAFT" ? { approvalWithdrawn: true } : {}) });
  return version;
}

export async function preparePlan(user: AuthUser, campusId: string, sourceYear: number, effectiveDateText: string) {
  await assertRegistrar(user);
  if (!Number.isInteger(sourceYear) || sourceYear < 2000 || sourceYear > 2200) throw new ApiError("Choose a source year", 400);
  const effectiveDate = dateOnly(effectiveDateText);
  const learners = await eligibleLearners(prisma, campusId, sourceYear);
  const evidence = new Map<string, Awaited<ReturnType<typeof evidenceFor>>>();
  for (const learner of learners) evidence.set(learner.id, await evidenceFor(campusId, learner.id, learner.classId, sourceYear));

  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rollover:${campusId}:${sourceYear}`}))`;
    let plan = await tx.rolloverPlan.findFirst({ where: { campusId, sourceYear } });
    if (!plan) {
      plan = await tx.rolloverPlan.create({ data: { schoolId: user.schoolId, campusId, sourceYear, destinationYear: sourceYear + 1, effectiveDate, createdById: user.userId } });
      await event(tx, plan, 1, "CREATED", user.userId, { learners: learners.length });
    }
    const existing = new Set((await tx.rolloverDecision.findMany({ where: { planId: plan.id }, select: { studentId: true } })).map(r => r.studentId));
    const added = learners.filter(l => !existing.has(l.id) && l.enrollments[0]);
    const unplaced = learners.filter(l => !l.enrollments[0]).length;
    for (const learner of added) {
      const found = evidence.get(learner.id)!;
      await tx.rolloverDecision.create({ data: {
        schoolId: user.schoolId, planId: plan.id, studentId: learner.id, sourceClassId: learner.classId, sourceEnrollmentId: learner.enrollments[0].id, sourceRollNo: learner.rollNo,
        evidence: found.evidence, evidenceDetail: found.detail, decision: found.evidence === "PASSED" ? "PROMOTE" : found.evidence === "FAILED" ? "RETAIN" : "NEEDS_REVIEW",
      } });
    }
    const dateChanged = plan.effectiveDate.getTime() !== effectiveDate.getTime();
    if (dateChanged && existing.size) {
      await bumpVersion(tx, plan, user.userId, "EFFECTIVE_DATE", { from: plan.effectiveDate.toISOString().slice(0, 10), to: effectiveDateText });
      await tx.rolloverPlan.update({ where: { id: plan.id }, data: { effectiveDate } });
    } else if (dateChanged) await tx.rolloverPlan.update({ where: { id: plan.id }, data: { effectiveDate } });
    if (added.length && existing.size) await bumpVersion(tx, await tx.rolloverPlan.findUniqueOrThrow({ where: { id: plan.id } }), user.userId, "LEARNERS_ADDED", { added: added.length });
    return { planId: plan.id, added: added.length, unplaced };
  }, { timeout: 60_000 });
}

export async function setClassMap(user: AuthUser, planId: string, version: number, sourceClassId: string, map: { promote?: string | null; retain?: string | null }) {
  await assertRegistrar(user);
  return prisma.$transaction(async tx => {
    const plan = await getPlan(user, planId, tx);
    if (plan.version !== version) throw new ApiError("The plan changed while you were editing. Reload and review again.", 409);
    for (const id of [map.promote, map.retain]) if (id && !(await tx.class.findFirst({ where: { id, campusId: plan.campusId, academicYear: plan.destinationYear, status: "ACTIVE", archivedAt: null } }))) {
      throw new ApiError(`Destination must be an active ${plan.destinationYear} class in this campus`, 400);
    }
    const current = (plan.classMap ?? {}) as ClassMap;
    const next: ClassMap = { ...current, [sourceClassId]: { promote: map.promote ?? null, retain: map.retain ?? null } };
    const nextVersion = await bumpVersion(tx, plan, user.userId, "DESTINATIONS", { sourceClassId, ...next[sourceClassId] });
    await tx.rolloverPlan.update({ where: { id: plan.id }, data: { classMap: next } });
    await tx.rolloverDecision.updateMany({ where: { planId, sourceClassId, executionStatus: "BLOCKED" }, data: { executionStatus: "PENDING", executionNote: null } });
    return { version: nextVersion };
  });
}

export async function decide(user: AuthUser, planId: string, version: number, rows: { studentId: string; decision: string; destinationClassId?: string | null; reason?: string | null }[]) {
  await assertRegistrar(user);
  if (!rows.length || rows.length > 500) throw new ApiError("Choose between 1 and 500 learners", 400);
  return prisma.$transaction(async tx => {
    const plan = await getPlan(user, planId, tx);
    if (plan.version !== version) throw new ApiError("The plan changed while you were editing. Reload and review again.", 409);
    const found = await tx.rolloverDecision.findMany({ where: { planId, studentId: { in: rows.map(r => r.studentId) } } });
    if (found.length !== new Set(rows.map(r => r.studentId)).size) throw new ApiError("A learner is not part of this plan", 400);
    const byStudent = new Map(found.map(r => [r.studentId, r]));
    for (const row of rows) {
      if (!DECISIONS.includes(row.decision as Decision)) throw new ApiError("Unknown decision", 400);
      const current = byStudent.get(row.studentId)!;
      if (current.executionStatus === "DONE" || current.executionStatus === "REVERSED") throw new ApiError("Applied decisions change only through a correction", 409);
      if (row.destinationClassId && !(await tx.class.findFirst({ where: { id: row.destinationClassId, campusId: plan.campusId, academicYear: plan.destinationYear, status: "ACTIVE", archivedAt: null } }))) {
        throw new ApiError(`Destination must be an active ${plan.destinationYear} class in this campus`, 400);
      }
      const reason = row.reason?.trim().slice(0, 500) || null;
      await tx.rolloverDecision.update({ where: { id: current.id }, data: {
        decision: row.decision, destinationClassId: row.decision === "PROMOTE" || row.decision === "RETAIN" ? row.destinationClassId || null : null,
        reason, reviewedById: user.userId, reviewedAt: new Date(), executionStatus: "PENDING", executionNote: null,
      } });
    }
    const nextVersion = await bumpVersion(tx, plan, user.userId, "DECISIONS", { learners: rows.length, decisions: [...new Set(rows.map(r => r.decision))] });
    return { version: nextVersion };
  });
}

export async function setClassCapacity(user: AuthUser, campusId: string, classId: string, capacity: number | null) {
  await assertRegistrar(user);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 500)) throw new ApiError("Capacity must be a whole number from 0 to 500", 400);
  const cls = await prisma.class.findFirst({ where: { id: classId, campusId } });
  if (!cls) throw new ApiError("Class not found", 404);
  await prisma.$transaction([
    prisma.class.update({ where: { id: classId }, data: { capacity } }),
    prisma.auditLog.create({ data: { tableName: "classes", recordId: classId, userId: user.userId, oldValue: { capacity: cls.capacity }, newValue: { capacity } } }),
  ]);
  return { capacity };
}

type Row = Awaited<ReturnType<typeof prisma.rolloverDecision.findMany>>[number];
const destinationOf = (row: Pick<Row, "decision" | "destinationClassId" | "sourceClassId">, map: ClassMap) =>
  row.decision === "PROMOTE" ? row.destinationClassId || map[row.sourceClassId]?.promote || null
    : row.decision === "RETAIN" ? row.destinationClassId || map[row.sourceClassId]?.retain || null : null;
const needsReason = (row: Pick<Row, "decision" | "evidence">) => row.evidence === "MISSING" ||
  (row.decision === "PROMOTE" && row.evidence !== "PASSED") || (row.decision === "RETAIN" && row.evidence === "PASSED") || row.decision === "GRADUATE" || row.decision === "TRANSFER_OUT";

async function measure(db: TxClient, rows: Pick<Row, "studentId" | "sourceEnrollmentId">[]): Promise<Omit<Baseline, "learners">> {
  const students = rows.map(r => r.studentId), enrollments = rows.map(r => r.sourceEnrollmentId);
  const [balances, attendance, reports, invoices] = await Promise.all([
    db.invoice.groupBy({ by: ["currency"], where: { studentId: { in: students }, balanceDue: { gt: 0 } }, _sum: { balanceDue: true }, orderBy: { currency: "asc" } }),
    db.attendance.count({ where: { enrollmentId: { in: enrollments } } }),
    db.reportCard.count({ where: { enrollmentId: { in: enrollments } } }),
    db.invoice.count({ where: { enrollmentId: { in: enrollments } } }),
  ]);
  return { balances: balances.map(b => ({ currency: b.currency, minor: b._sum.balanceDue || 0 })), history: { attendance, reports, invoices } };
}

export async function loadRollover(user: AuthUser, campusId: string, requestedYear?: number | null) {
  await assertRolloverRead(user);
  const years = (await prisma.class.groupBy({ by: ["academicYear"], where: { campusId, archivedAt: null }, orderBy: { academicYear: "asc" } })).map(y => y.academicYear);
  const withLearners = (await prisma.class.groupBy({ by: ["academicYear"], where: { campusId, archivedAt: null, students: { some: { status: "active", archivedAt: null } } }, orderBy: { academicYear: "asc" } })).map(y => y.academicYear);
  const sourceYear = requestedYear && years.includes(requestedYear) ? requestedYear : withLearners[0] ?? years[0] ?? new Date().getFullYear();
  const destinationYear = sourceYear + 1;
  const [readiness, sourceClasses, destinationClasses, plan] = await Promise.all([
    getYearClosureReport(campusId, sourceYear),
    prisma.class.findMany({ where: { campusId, academicYear: sourceYear, archivedAt: null }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }, { section: "asc" }] }),
    prisma.class.findMany({ where: { campusId, academicYear: destinationYear, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, capacity: true, _count: { select: { students: { where: { status: "active", archivedAt: null } } } } }, orderBy: [{ name: "asc" }, { section: "asc" }] }),
    prisma.rolloverPlan.findFirst({ where: { campusId, sourceYear } }),
  ]);
  const base = { years, sourceYear, destinationYear, readiness, sourceClasses: sourceClasses.map(c => ({ id: c.id, label: classLabel(c) })) };
  const destinations = destinationClasses.map(c => ({ id: c.id, label: classLabel(c), capacity: c.capacity, occupancy: c._count.students }));
  if (!plan) return { ...base, destinations: destinations.map(d => ({ ...d, incoming: 0 })), eligible: (await eligibleLearners(prisma, campusId, sourceYear)).length, plan: null };

  const rows = await prisma.rolloverDecision.findMany({ where: { planId: plan.id }, orderBy: [{ sourceClassId: "asc" }, { sourceRollNo: "asc" }] });
  const names = new Map((await prisma.student.findMany({ where: { id: { in: rows.map(r => r.studentId) } }, select: { id: true, fullName: true, admissionNo: true } })).map(s => [s.id, s]));
  const map = (plan.classMap ?? {}) as ClassMap;
  const destById = new Map(destinations.map(d => [d.id, d]));
  const pending = rows.filter(r => r.executionStatus === "PENDING" || r.executionStatus === "BLOCKED");
  const incoming = new Map<string, number>();
  for (const row of pending) { const dest = destinationOf(row, map); if (dest) incoming.set(dest, (incoming.get(dest) ?? 0) + 1); }
  const enrolledAhead = new Set((await prisma.studentEnrollment.findMany({ where: { studentId: { in: pending.map(r => r.studentId) }, academicYear: destinationYear, id: { notIn: pending.map(r => r.sourceEnrollmentId) } }, select: { studentId: true } })).map(e => e.studentId));
  const sourceLabel = new Map(sourceClasses.map(c => [c.id, classLabel(c)]));

  const learners = rows.map(row => {
    const dest = destinationOf(row, map), issues: string[] = [], warnings: string[] = [];
    const open = row.executionStatus === "PENDING" || row.executionStatus === "BLOCKED";
    if (open) {
      if (row.decision === "NEEDS_REVIEW") issues.push(row.evidence === "MISSING" ? "Results are missing; choose a decision" : "Needs a decision");
      if ((row.decision === "PROMOTE" || row.decision === "RETAIN") && !dest) issues.push("Choose a destination class");
      if (dest && !destById.has(dest)) issues.push("Destination is no longer an active class in the destination year");
      if (needsReason(row) && !row.reason) issues.push("Give a reason for this decision");
      if (enrolledAhead.has(row.studentId)) issues.push("Already enrolled in the destination year");
      const target = dest ? destById.get(dest) : null;
      if (target?.capacity != null && target.occupancy + (incoming.get(target.id) ?? 0) > target.capacity) issues.push("Destination is over capacity");
      if (target && target.capacity == null) warnings.push("Destination capacity is not set");
    }
    const person = names.get(row.studentId);
    return { studentId: row.studentId, name: person?.fullName ?? "", admissionNo: person?.admissionNo ?? null, sourceClassId: row.sourceClassId, sourceClass: sourceLabel.get(row.sourceClassId) ?? "",
      sourceRollNo: row.sourceRollNo, evidence: row.evidence, evidenceDetail: row.evidenceDetail, decision: row.decision, destinationClassId: row.destinationClassId, effectiveDestination: dest,
      reason: row.reason, executionStatus: row.executionStatus, executionNote: row.executionNote, newRollNo: row.newRollNo, executedAt: row.executedAt, issues, warnings };
  });

  const blockers = [
    ...(readiness.canClose ? [] : readiness.blockingReasons.map(reason => ({ kind: "readiness", text: reason }))),
    ...(!destinations.length ? [{ kind: "destination", text: `No active ${destinationYear} classes exist yet.` }] : []),
  ];
  const withIssues = learners.filter(l => l.issues.length).length;
  const count = (key: "decision" | "executionStatus") => learners.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l[key]]: (acc[l[key]] ?? 0) + 1 }), {});
  const statuses = count("executionStatus");
  const baseline = plan.baseline as Baseline | null;
  const reconciliation = baseline ? { baseline, now: await measure(prisma, rows), learners: rows.length,
    accounted: (statuses.DONE ?? 0) + (statuses.BLOCKED ?? 0) + (statuses.REVERSED ?? 0), clean: !(statuses.PENDING ?? 0) && !(statuses.BLOCKED ?? 0) } : null;
  const events = await prisma.rolloverEvent.findMany({ where: { planId: plan.id }, orderBy: { createdAt: "desc" }, take: 30 });
  const leaseActive = plan.status === "EXECUTING" && !!plan.leaseUntil && plan.leaseUntil > new Date();
  return {
    ...base, destinations: destinations.map(d => ({ ...d, incoming: incoming.get(d.id) ?? 0 })), eligible: rows.length,
    plan: { id: plan.id, version: plan.version, status: plan.status, effectiveDate: plan.effectiveDate.toISOString().slice(0, 10), classMap: map,
      approvedVersion: plan.approvedVersion, approvedAt: plan.approvedAt, approvalCurrent: plan.approvedVersion === plan.version && plan.status !== "DRAFT",
      canApprove: plan.status === "DRAFT" && !blockers.length && !withIssues && pending.length > 0,
      // G35b: whether this viewer holds the academic-lead seat that approves the plan (the principal, or a
      // campus operator only while the campus has no principal). The campus console hides Approve otherwise.
      viewerApproves: await canLeadAcademics(user, plan.campusId),
      canExecute: plan.approvedVersion === plan.version && (["APPROVED", "PAUSED"].includes(plan.status) || (plan.status === "EXECUTING" && !leaseActive)) && pending.some(r => r.executionStatus === "PENDING") },
    blockers, needsDecision: learners.filter(l => l.issues.length && l.decision === "NEEDS_REVIEW").length, withIssues,
    counts: { decisions: count("decision"), execution: statuses }, learners, reconciliation,
    events: events.map(e => ({ id: e.id, version: e.version, kind: e.kind, at: e.createdAt, detail: e.detail })),
  };
}

export async function approvePlan(user: AuthUser, campusId: string, planId: string, version: number) {
  // G35b: the campus office prepares, maps, decides and runs promotion; approving the plan is the academic
  // lead's act (the principal, or a campus operator only while the campus has no principal). Approval changes
  // no student record itself (the office runs the batches), so it needs students.view — the principal's V2
  // default (§7.4) — never students.edit. The seat is checked before the plan is loaded, so a refused caller
  // learns nothing about plan ids, and again on the plan's own campus.
  await assertPermission(user, "students", "view");
  if (!(await canLeadAcademics(user, campusId))) throw new ApiError("Your principal approves the promotion plan.", 403);
  const plan = await getPlan(user, planId);
  if (!(await canLeadAcademics(user, plan.campusId))) throw new ApiError("Your principal approves the promotion plan.", 403);
  const view = await loadRollover(user, campusId, plan.sourceYear);
  if (!view.plan || view.plan.id !== planId) throw new ApiError("Rollover plan not found", 404);
  if (plan.version !== version) throw new ApiError("Approval must name the current plan version. Reload and review again.", 409);
  if (view.blockers.length) throw new ApiError(`The year is not ready to roll over: ${view.blockers[0].text}`, 409);
  if (view.withIssues) throw new ApiError(view.needsDecision ? `${view.needsDecision} learner(s) need a decision before this plan can be approved.` : `${view.withIssues} learner(s) still have problems to resolve.`, 409);
  if (!view.plan.canApprove) throw new ApiError("This plan cannot be approved in its current state", 409);
  return prisma.$transaction(async tx => {
    const claimed = await tx.rolloverPlan.updateMany({ where: { id: planId, version, status: "DRAFT" }, data: { status: "APPROVED", approvedVersion: version, approvedById: user.userId, approvedAt: new Date() } });
    if (!claimed.count) throw new ApiError("The plan changed while you were approving. Reload and review again.", 409);
    const rows = await tx.rolloverDecision.findMany({ where: { planId }, select: { studentId: true, sourceEnrollmentId: true } });
    // The first approval fixes the reconciliation baseline; later re-approvals keep it.
    if (!plan.baseline) await tx.rolloverPlan.update({ where: { id: planId }, data: { baseline: { learners: rows.length, ...(await measure(tx, rows)) } } });
    await event(tx, plan, version, "APPROVED", user.userId, { learners: rows.length, decisions: view.counts.decisions });
    return { version };
  });
}

async function nextRoll(tx: TxClient, cls: { id: string; name: string; section: string | null; campusId: string }) {
  const prefix = `${cls.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}-${(cls.section || "A").charAt(0).toUpperCase()}-`;
  const rolls = await tx.student.findMany({ where: { campusId: cls.campusId, rollNo: { startsWith: prefix } }, select: { rollNo: true } });
  const max = rolls.reduce((m, r) => { const n = parseInt(r.rollNo.slice(prefix.length), 10); return Number.isFinite(n) && n > m ? n : m; }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

async function applyRow(tx: TxClient, user: AuthUser, plan: { id: string; campusId: string; sourceYear: number; destinationYear: number; effectiveDate: Date; classMap: unknown }, row: Row) {
  const map = (plan.classMap ?? {}) as ClassMap;
  const pupil = await tx.student.findFirst({ where: { id: row.studentId, status: "active", archivedAt: null, consolidatedIntoId: null } });
  const current = await tx.studentEnrollment.findFirst({ where: { studentId: row.studentId, status: "ACTIVE", endDate: null } });
  if (!pupil || !current || current.id !== row.sourceEnrollmentId || pupil.classId !== row.sourceClassId) throw new ApiError("Placement changed since this plan was reviewed; review this learner again.", 409);
  if (await tx.studentEnrollment.count({ where: { studentId: row.studentId, academicYear: plan.destinationYear, id: { not: row.sourceEnrollmentId } } })) throw new ApiError(`Already enrolled in ${plan.destinationYear}.`, 409);
  const detail = (row.evidenceDetail ?? {}) as { percentage?: number; grade?: string };
  const history = async (status: string, promotedToClassId: string | null) => tx.studentClassHistory.upsert({
    where: { studentId_classId_academicYear: { studentId: row.studentId, classId: row.sourceClassId, academicYear: plan.sourceYear } },
    create: { studentId: row.studentId, classId: row.sourceClassId, campusId: plan.campusId, rollNo: row.sourceRollNo, academicYear: plan.sourceYear, status, finalGrade: detail.grade ?? null, finalPercentage: detail.percentage ?? null, promotedToClassId },
    update: { status, promotedToClassId },
  });
  const reason = `Year-end rollover ${plan.sourceYear}→${plan.destinationYear}${row.reason ? `: ${row.reason}` : ""}`;

  if (row.decision === "PROMOTE" || row.decision === "RETAIN") {
    const destId = destinationOf(row, map);
    if (!destId) throw new ApiError("No destination class is set; review this learner again.", 409);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rollover-class:${destId}`}))`;
    const dest = await tx.class.findFirst({ where: { id: destId, campusId: plan.campusId, academicYear: plan.destinationYear, status: "ACTIVE", archivedAt: null } });
    if (!dest) throw new ApiError("The destination class is no longer available; review this learner again.", 409);
    if (dest.capacity != null) {
      const occupancy = await tx.student.count({ where: { classId: dest.id, status: "active", archivedAt: null } });
      if (occupancy >= dest.capacity) throw new ApiError(`${classLabel(dest)} is full (${occupancy} of ${dest.capacity}); review this learner again.`, 409);
    }
    const rollNo = await nextRoll(tx, dest);
    const { enrollment } = await applyEnrollment(tx, { studentId: row.studentId, fromId: row.sourceEnrollmentId, targetClassId: dest.id, effectiveDate: plan.effectiveDate, rollNo, actorId: user.userId, reason });
    await history(row.decision === "PROMOTE" ? "PROMOTED" : "RETAINED", row.decision === "PROMOTE" ? dest.id : null);
    await tx.studentTimelineEvent.create({ data: { studentId: row.studentId, kind: row.decision === "PROMOTE" ? "PROMOTED" : "NOTE",
      title: row.decision === "PROMOTE" ? `Promoted to ${classLabel(dest)}` : `Retained — repeats in ${classLabel(dest)}`, detail: `Class ${classLabel(dest)} · Roll ${rollNo}`, actorId: user.userId } });
    return { newEnrollmentId: enrollment.id, newRollNo: rollNo };
  }
  if (row.decision === "GRADUATE" || row.decision === "TRANSFER_OUT") {
    await applyWithdrawal(tx, { studentId: row.studentId, effectiveDate: plan.effectiveDate, actorId: user.userId, reason, outcome: row.decision === "GRADUATE" ? "GRADUATED" : "TRANSFERRED" });
    await history(row.decision === "GRADUATE" ? "GRADUATED" : "TRANSFERRED", null);
    return { newEnrollmentId: null, newRollNo: null };
  }
  throw new ApiError("This learner still needs a decision.", 409);
}

export async function executePlan(user: AuthUser, planId: string, version: number, limit = 50) {
  await assertRegistrar(user);
  const plan = await getPlan(user, planId);
  if (plan.effectiveDate > today()) throw new ApiError(`Execution opens on the effective date, ${plan.effectiveDate.toISOString().slice(0, 10)}.`, 409);
  const now = new Date();
  const claimed = await prisma.rolloverPlan.updateMany({
    where: { id: planId, version, approvedVersion: version, OR: [{ status: { in: ["APPROVED", "PAUSED"] } }, { status: "EXECUTING", leaseUntil: { lt: now } }] },
    data: { status: "EXECUTING", leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (!claimed.count) throw new ApiError(plan.status === "EXECUTING" ? "A batch is already running for this plan." : "Only the approved version of this plan can be executed. Reload and review again.", 409);
  await event(prisma, plan, version, "BATCH_STARTED", user.userId, { limit });

  const batch = await prisma.rolloverDecision.findMany({ where: { planId, executionStatus: "PENDING" }, orderBy: [{ sourceClassId: "asc" }, { sourceRollNo: "asc" }], take: Math.max(1, Math.min(limit, 200)) });
  let done = 0, blocked = 0, failure: string | null = null;
  for (const row of batch) {
    try {
      await prisma.$transaction(async tx => {
        const result = await applyRow(tx, user, plan, row);
        // The row's own status flips in the same transaction, so a retry after
        // an interruption can never apply this learner twice.
        const flipped = await tx.rolloverDecision.updateMany({ where: { id: row.id, executionStatus: "PENDING" }, data: { executionStatus: "DONE", executionNote: null, executedAt: new Date(), ...result } });
        if (!flipped.count) throw new ApiError("Already applied", 409);
      }, { timeout: 30_000 });
      done++;
    } catch (error) {
      if (error instanceof ApiError) {
        await prisma.rolloverDecision.updateMany({ where: { id: row.id, executionStatus: "PENDING" }, data: { executionStatus: "BLOCKED", executionNote: error.message } });
        blocked++;
      } else { failure = "A learner could not be applied because of a system error. The batch paused at the last confirmed learner."; console.error("[rollover] row failed", error); break; }
    }
    await prisma.rolloverPlan.updateMany({ where: { id: planId, status: "EXECUTING" }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
  }

  const remaining = await prisma.rolloverDecision.groupBy({ by: ["executionStatus"], where: { planId }, _count: true });
  const tally = Object.fromEntries(remaining.map(r => [r.executionStatus, r._count])) as Record<string, number>;
  const status = (tally.PENDING ?? 0) > 0 ? "PAUSED" : (tally.BLOCKED ?? 0) > 0 ? "EXCEPTIONS" : "COMPLETED";
  await prisma.rolloverPlan.updateMany({ where: { id: planId, status: "EXECUTING" }, data: { status, leaseUntil: null } });
  await event(prisma, plan, version, "BATCH_FINISHED", user.userId, { done, blocked, remaining: tally.PENDING ?? 0, status, ...(failure ? { failure } : {}) });
  if (status !== "PAUSED") {
    const first = await prisma.rolloverPlan.updateMany({ where: { id: planId, notifiedAt: null }, data: { notifiedAt: new Date() } });
    const promoted = await prisma.rolloverDecision.count({ where: { planId, decision: "PROMOTE", executionStatus: "DONE" } });
    if (first.count) notify("STUDENTS_PROMOTED", { schoolId: user.schoolId, campusId: plan.campusId, actorId: user.userId, actorName: user.fullName, count: promoted, className: `${plan.destinationYear} classes` });
  }
  return { done, blocked, remaining: tally.PENDING ?? 0, status, failure };
}

export async function reverseDecision(user: AuthUser, planId: string, studentId: string, reason: string, effectiveDateText: string) {
  await assertRegistrar(user);
  const why = reason.trim();
  if (why.length < 5) throw new ApiError("Explain why this rollover is being corrected", 400);
  const effectiveDate = dateOnly(effectiveDateText);
  return prisma.$transaction(async tx => {
    const plan = await getPlan(user, planId, tx);
    const row = await tx.rolloverDecision.findFirst({ where: { planId, studentId } });
    if (!row || row.executionStatus !== "DONE") throw new ApiError("Only an applied decision can be corrected", 409);
    if (row.decision !== "PROMOTE" && row.decision !== "RETAIN" || !row.newEnrollmentId) throw new ApiError("Graduation and transfer are corrected through re-admission, not here.", 409);
    if (effectiveDate <= plan.effectiveDate || effectiveDate > today()) throw new ApiError("The correction date must be after the rollover date and no later than today.", 400);
    const current = await tx.studentEnrollment.findFirst({ where: { studentId, status: "ACTIVE", endDate: null } });
    if (current?.id !== row.newEnrollmentId) throw new ApiError("The learner has moved since the rollover. Record a reviewed transfer instead.", 409);
    const [attendance, invoices, reports] = await Promise.all([
      tx.attendance.count({ where: { enrollmentId: row.newEnrollmentId } }), tx.invoice.count({ where: { enrollmentId: row.newEnrollmentId } }), tx.reportCard.count({ where: { enrollmentId: row.newEnrollmentId } }),
    ]);
    if (attendance || invoices || reports) throw new ApiError(`Unsafe to undo: the new placement already has ${attendance} attendance, ${invoices} invoice and ${reports} report record(s). Record a reviewed transfer instead so they stay attached.`, 409);
    const source = await tx.class.findFirst({ where: { id: row.sourceClassId, status: "ACTIVE", archivedAt: null } });
    if (!source) throw new ApiError("The source class is closed. Record a reviewed transfer into an open class instead.", 409);
    await applyEnrollment(tx, { studentId, fromId: row.newEnrollmentId, targetClassId: source.id, effectiveDate, rollNo: row.sourceRollNo, actorId: user.userId, reason: `Rollover correction: ${why}` });
    await tx.studentClassHistory.updateMany({ where: { studentId, classId: row.sourceClassId, academicYear: plan.sourceYear }, data: { status: "ACTIVE", promotedToClassId: null } });
    await tx.rolloverDecision.update({ where: { id: row.id }, data: { executionStatus: "REVERSED", executionNote: why } });
    await event(tx, plan, plan.version, "CORRECTED", user.userId, { studentId, reason: why, effectiveDate: effectiveDateText });
    return { reversed: true };
  }, { timeout: 30_000 });
}
