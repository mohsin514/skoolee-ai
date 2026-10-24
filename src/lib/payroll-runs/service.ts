import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { calculateRun, EXPORT_FIELDS, exportFile, leaveYearStart, periodEnd, periodStart, type Basis, type EmployeeInput, type ExportField, type PayException, type PayLine, type PolicyRules, type Rounding } from "./engine";

/**
 * SKO-434 payroll runs on a school-configured policy, exported to the school's provider.
 *
 * - A run names its entity, period, currency, policy version and provider before it calculates.
 * - Preparation and approval are separate; approval binds a hash of the frozen inputs. Changing an
 *   input (salary, leave, provider id, adjustment) makes an approved version STALE, and a new
 *   version must be prepared and approved. Missing provider ids, an unsupported currency and
 *   negative net pay block approval.
 * - A submission is created once per approved version: a retry reuses its reference and resends
 *   only rows without an outcome. Rejected rows go to a correction version that covers only them
 *   and needs approval again; accepted rows are never resubmitted. Exported does not mean paid.
 */

// role-ux G26 / §2.5: the finance desk prepares and exports; the campus admin approves and owns the policy and
// the provider mapping (the super admin keeps audited break-glass approval, never offered in a console). The
// principal is academic and holds neither seat.
const APPROVERS = ["CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"];
const PREPARERS = ["ACCOUNTANT", "CAMPUS_ADMIN", "ADMIN"];
const STAFF_ROLES = ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const;
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const day = z.iso.date();

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function campusOf(user: AuthUser) { if (!user.campusId) throw new ApiError("Choose a campus first.", 400); return user.campusId; }
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
const push = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

async function canPrepare(user: AuthUser) {
  assert(PREPARERS.includes(user.role), "Only the finance desk prepares payroll.");
  await assertPermission(user, "payroll", "view");
}
async function canApprove(user: AuthUser) {
  assert(APPROVERS.includes(user.role), "Only your campus admin approves payroll.");
  await assertPermission(user, "payroll", "edit");
}
/** Reading the payroll workspace: anyone who prepares or approves it. */
async function canRead(user: AuthUser) {
  assert(PREPARERS.includes(user.role) || APPROVERS.includes(user.role), "Payroll access is required.");
  await assertPermission(user, "payroll", "view");
}

// ─── Configuration ─────────────────────────────────────────────

const PolicyInput = z.object({
  entityName: text(2, 160), currency: z.string().regex(/^[A-Z]{3}$/u), effectiveFrom: day,
  packageLabel: text(2, 80), scopeNote: text(10, 600),
  prorationBasis: z.enum(["CALENDAR_DAYS", "FIXED_30"]), leaveDivisor: z.enum(["CALENDAR_DAYS", "FIXED_30"]),
  leaveYearStartMonth: z.number().int().min(1).max(12), rounding: z.enum(["HALF_UP", "DOWN"]), requireSeparation: z.boolean().default(true),
}).strict();

/** Policies are versioned and never edited; a change is the next version from its effective date. */
export async function savePolicy(user: AuthUser, raw: unknown) {
  await canApprove(user);
  const input = parse(PolicyInput, raw), campusId = campusOf(user);
  return prisma.$transaction(async (tx) => {
    const last = await tx.payrollPolicy.findFirst({ where: { campusId }, orderBy: { version: "desc" }, select: { version: true } });
    const policy = await tx.payrollPolicy.create({ data: { ...input, effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`), schoolId: user.schoolId, campusId, version: (last?.version ?? 0) + 1, createdById: user.userId } });
    await writeAuditEvent(tx, user, { table: "payroll_policies", recordId: policy.id, action: "CREATE", campusId, after: { version: policy.version, currency: policy.currency, effectiveFrom: input.effectiveFrom, packageLabel: policy.packageLabel } });
    return policy;
  });
}

const ProviderInput = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{2,40}$/u, "Use capitals, digits, - or _ for the provider code"), name: text(2, 120),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/u)).min(1).max(10),
  columns: z.array(z.object({ header: text(1, 60), field: z.enum(EXPORT_FIELDS as [ExportField, ...ExportField[]]) }).strict()).min(2).max(20),
}).strict();

/** A provider mapping version is immutable; saving the same code creates the next version. */
export async function saveProvider(user: AuthUser, raw: unknown) {
  await canApprove(user);
  const input = parse(ProviderInput, raw), campusId = campusOf(user);
  assert(input.columns.some((c) => c.field === "providerEmployeeId") && input.columns.some((c) => c.field === "net"), "The mapping must export the provider employee id and net pay.", 400);
  return prisma.$transaction(async (tx) => {
    const last = await tx.payrollProvider.findFirst({ where: { campusId, code: input.code }, orderBy: { version: "desc" }, select: { version: true } });
    const provider = await tx.payrollProvider.create({ data: { ...input, columns: json(input.columns), schoolId: user.schoolId, campusId, version: (last?.version ?? 0) + 1, createdById: user.userId } });
    await writeAuditEvent(tx, user, { table: "payroll_providers", recordId: provider.id, action: "CREATE", campusId, after: { code: provider.code, version: provider.version, currencies: input.currencies.join(",") } });
    return provider;
  });
}

/** Provider employee ids and a last working day. Changing either makes approved runs stale. */
export async function setEmployee(user: AuthUser, userId: string, raw: unknown) {
  await canPrepare(user);
  const input = parse(z.object({ providerIds: z.record(z.string().regex(/^[A-Z0-9_-]{2,40}$/u), z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/u, "Invalid provider employee id")).optional(), leavingDate: day.nullable().optional() }).strict(), raw);
  const campusId = campusOf(user);
  const staff = await prisma.user.findFirst({ where: { id: userId, campusId }, select: { id: true } });
  assert(!!staff, "Staff member not found", 404);
  const existing = await prisma.payrollEmployee.findUnique({ where: { schoolId_userId: { schoolId: user.schoolId, userId } } });
  const providerIds = { ...((existing?.providerIds as Record<string, string>) ?? {}), ...(input.providerIds ?? {}) };
  const leavingDate = input.leavingDate === undefined ? existing?.leavingDate ?? null : input.leavingDate ? new Date(`${input.leavingDate}T00:00:00Z`) : null;
  const saved = await prisma.payrollEmployee.upsert({ where: { schoolId_userId: { schoolId: user.schoolId, userId } }, create: { schoolId: user.schoolId, campusId, userId, providerIds, leavingDate, updatedById: user.userId }, update: { providerIds, leavingDate, updatedById: user.userId } });
  await invalidateApproved(campusId, "Employee payroll details changed");
  return saved;
}

const AdjustmentInput = z.object({ userId: text(1, 120), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), kind: z.enum(["EARNING", "DEDUCTION"]), label: text(2, 80), amount: z.number().int().min(1).max(100_000_000), reason: text(5, 300) }).strict();

export async function addAdjustment(user: AuthUser, raw: unknown) {
  await canPrepare(user);
  const input = parse(AdjustmentInput, raw), campusId = campusOf(user);
  assert(!!(await prisma.user.findFirst({ where: { id: input.userId, campusId }, select: { id: true } })), "Staff member not found", 404);
  const adjustment = await prisma.payrollAdjustment.create({ data: { ...input, schoolId: user.schoolId, campusId, enteredById: user.userId } });
  await invalidateApproved(campusId, "An adjustment was added", input.year, input.month);
  return adjustment;
}

export async function voidAdjustment(user: AuthUser, id: string) {
  await canPrepare(user);
  const campusId = campusOf(user);
  const done = await prisma.payrollAdjustment.updateMany({ where: { id, campusId, voidedAt: null }, data: { voidedAt: new Date(), voidedById: user.userId } });
  assert(done.count === 1, "Adjustment not found or already voided", 404);
  const adj = await prisma.payrollAdjustment.findUniqueOrThrow({ where: { id } });
  await invalidateApproved(campusId, "An adjustment was voided", adj.year, adj.month);
  return adj;
}

// ─── Inputs ────────────────────────────────────────────────────

/** The policy in effect for the period: the latest effective date on or before the period's end. */
async function policyFor(db: TxClient, campusId: string, year: number, month: number) {
  return db.payrollPolicy.findFirst({ where: { campusId, effectiveFrom: { lte: new Date(`${periodEnd(year, month)}T00:00:00Z`) } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] });
}
const rulesOf = (p: { id: string; version: number; packageLabel: string; currency: string; prorationBasis: string; leaveDivisor: string; leaveYearStartMonth: number; rounding: string }): PolicyRules => ({ id: p.id, version: p.version, packageLabel: p.packageLabel, currency: p.currency, prorationBasis: p.prorationBasis as Basis, leaveDivisor: p.leaveDivisor as Basis, leaveYearStartMonth: p.leaveYearStartMonth, rounding: p.rounding as Rounding });

const amounts = (value: unknown) => Object.entries((value && typeof value === "object" ? value : {}) as Record<string, unknown>).map(([name, raw]) => ({ name, amount: Math.round(Number(raw)) })).filter((a) => Number.isFinite(a.amount) && a.amount !== 0);

/** Everything a calculation reads, frozen. The hash covers inputs, policy and provider mapping. */
async function collectInputs(db: TxClient, campusId: string, year: number, month: number, policy: PolicyRules, provider: { id: string; code: string }, scope: string[]) {
  const start = periodStart(year, month), end = periodEnd(year, month);
  const staff = await db.user.findMany({
    where: { campusId, isActive: true, role: { in: [...STAFF_ROLES] }, ...(scope.length ? { id: { in: scope } } : {}), staffProfile: { basicSalary: { gt: 0 } } },
    select: { id: true, fullName: true, role: true, joiningDate: true, staffProfile: { select: { basicSalary: true, allowancesJson: true, deductionsJson: true, updatedAt: true } } },
    orderBy: { id: "asc" },
  });
  const ids = staff.map((s) => s.id);
  const yearStart = leaveYearStart(policy, year, month);
  const [employees, leave, allocations, adjustments] = await Promise.all([
    db.payrollEmployee.findMany({ where: { userId: { in: ids } } }),
    db.leaveRequest.findMany({ where: { campusId, userId: { in: ids }, status: "APPROVED", toDate: { gte: new Date(`${yearStart}T00:00:00Z`) }, fromDate: { lte: new Date(`${end}T00:00:00Z`) } }, select: { id: true, userId: true, leaveTypeId: true, fromDate: true, toDate: true, days: true, leaveType: { select: { name: true } } }, orderBy: { id: "asc" } }),
    db.leaveAllocation.findMany({ where: { campusId, academicYear: Number(yearStart.slice(0, 4)) }, select: { leaveTypeId: true, role: true, userId: true, days: true } }),
    db.payrollAdjustment.findMany({ where: { campusId, year, month, voidedAt: null, userId: { in: ids } }, orderBy: { createdAt: "asc" } }),
  ]);
  const inputs: EmployeeInput[] = [];
  for (const s of staff) {
    const emp = employees.find((e) => e.userId === s.id);
    const leaving = iso(emp?.leavingDate);
    const joining = iso(s.joiningDate);
    if ((joining && joining > end) || (leaving && leaving < start)) continue; // not employed in this period
    const allowed: Record<string, number> = {};
    for (const a of allocations.filter((a) => !a.userId && a.role === s.role)) allowed[a.leaveTypeId] = a.days;
    for (const a of allocations.filter((a) => a.userId === s.id)) allowed[a.leaveTypeId] = a.days; // per-person row wins
    inputs.push({
      userId: s.id, name: s.fullName, role: s.role, joiningDate: joining, leavingDate: leaving,
      basic: s.staffProfile!.basicSalary, allowances: amounts(s.staffProfile!.allowancesJson), deductions: amounts(s.staffProfile!.deductionsJson),
      salarySource: `Staff profile (updated ${s.staffProfile!.updatedAt.toISOString().slice(0, 10)})`,
      providerEmployeeId: ((emp?.providerIds as Record<string, string> | undefined) ?? {})[provider.code] ?? null,
      leave: leave.filter((l) => l.userId === s.id).map((l) => ({ requestId: l.id, leaveTypeId: l.leaveTypeId, typeName: l.leaveType.name, from: iso(l.fromDate)!, to: iso(l.toDate)!, days: l.days })),
      allocations: allowed,
      adjustments: adjustments.filter((a) => a.userId === s.id).map((a) => ({ id: a.id, kind: a.kind as "EARNING" | "DEDUCTION", label: a.label, amount: a.amount, reason: a.reason, enteredById: a.enteredById })),
    });
  }
  const hash = createHash("sha256").update(JSON.stringify({ policy, provider: provider.id, inputs })).digest("hex");
  return { inputs, hash };
}

/** Approved, not-yet-exported versions whose inputs no longer match become STALE. */
async function invalidateApproved(campusId: string, reason: string, year?: number, month?: number) {
  const approved = await prisma.payrollCalculation.findMany({ where: { campusId, status: "APPROVED", ...(year ? { year, month } : {}) } });
  for (const calc of approved) await staleIfChanged(prisma, calc, reason);
}

async function staleIfChanged(db: TxClient, calc: { id: string; campusId: string; year: number; month: number; policyId: string; providerId: string; scopeUserIds: string[]; inputHash: string }, reason: string) {
  const [policy, provider] = await Promise.all([db.payrollPolicy.findUniqueOrThrow({ where: { id: calc.policyId } }), db.payrollProvider.findUniqueOrThrow({ where: { id: calc.providerId } })]);
  const { hash } = await collectInputs(db, calc.campusId, calc.year, calc.month, rulesOf(policy), provider, calc.scopeUserIds);
  if (hash === calc.inputHash) return false;
  await db.payrollCalculation.updateMany({ where: { id: calc.id, status: "APPROVED" }, data: { status: "STALE", staleReason: reason, approvedById: null, approvedAt: null } });
  return true;
}

// ─── Runs ──────────────────────────────────────────────────────

const Period = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) });

/**
 * Prepare the next version of a period (or a correction of a submission's rejected rows). Earlier
 * open versions are superseded. Once a version is exported, only corrections may follow.
 */
export async function prepareRun(user: AuthUser, raw: unknown, correctionOfId?: string) {
  await canPrepare(user);
  const campusId = campusOf(user);
  let { year, month, providerId } = parse(Period.extend({ providerId: text(1, 120).optional() }).strict(), raw);
  let scope: string[] = [];
  if (correctionOfId) {
    const original = await prisma.payrollCalculation.findFirst({ where: { id: correctionOfId, campusId } });
    assert(!!original, "Run not found", 404);
    const submission = await prisma.payrollSubmission.findUnique({ where: { calculationId: original.id } });
    scope = ((submission?.rows ?? []) as { userId: string; outcome: string }[]).filter((r) => r.outcome === "REJECTED").map((r) => r.userId);
    assert(scope.length > 0, "This submission has no rejected rows to correct.", 409);
    const open = await prisma.payrollCalculation.findFirst({ where: { correctionOfId: original.id, status: { in: ["DRAFT", "APPROVED", "STALE", "EXPORTED"] } } });
    if (open?.status === "EXPORTED") throw new ApiError("A correction of this submission was already exported.", 409);
    ({ year, month } = original);
    providerId ??= original.providerId;
  } else {
    const exported = await prisma.payrollCalculation.findFirst({ where: { campusId, year, month, correctionOfId: null, status: "EXPORTED" } });
    assert(!exported, "This period was already exported. Rejected rows are corrected from the submission; accepted rows are never paid twice.", 409);
  }
  const policyRow = await policyFor(prisma, campusId, year, month);
  assert(!!policyRow, `No payroll policy is in effect for ${periodEnd(year, month)}. There is no default rule package; configure this entity's policy first.`, 409);
  const provider = providerId
    ? await prisma.payrollProvider.findFirst({ where: { id: providerId, campusId } })
    : await prisma.payrollProvider.findFirst({ where: { campusId }, orderBy: [{ createdAt: "desc" }, { version: "desc" }] });
  assert(!!provider, "Configure the payroll provider's export mapping first.", 409);
  const policy = rulesOf(policyRow);
  const { inputs, hash } = await collectInputs(prisma, campusId, year, month, policy, provider, scope);
  assert(inputs.length > 0, "No eligible staff with a salary in this period.", 409);
  const result = calculateRun(policy, year, month, inputs, provider.currencies);
  return prisma.$transaction(async (tx) => {
    const last = await tx.payrollCalculation.findFirst({ where: { campusId, year, month }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.payrollCalculation.updateMany({ where: { campusId, year, month, status: { in: ["DRAFT", "APPROVED", "STALE"] }, correctionOfId: correctionOfId ?? null }, data: { status: "SUPERSEDED" } });
    const calc = await tx.payrollCalculation.create({ data: {
      schoolId: user.schoolId, campusId, year, month, version: (last?.version ?? 0) + 1, policyId: policyRow.id, policyVersion: policyRow.version, currency: policyRow.currency, entityName: policyRow.entityName,
      providerId: provider.id, correctionOfId: correctionOfId ?? null, scopeUserIds: scope, inputs: json(inputs), inputHash: hash, lines: json(result.lines), exceptions: json(result.exceptions), totalNet: result.totalNet, preparedById: user.userId,
    } });
    await writeAuditEvent(tx, user, { table: "payroll_calculations", recordId: calc.id, action: "CREATE", campusId, after: { year, month, version: calc.version, policyVersion: calc.policyVersion, employees: inputs.length, exceptions: result.exceptions.length, correction: !!correctionOfId } });
    return calc;
  });
}

/**
 * Approving a run is a money decision (role-ux R3, §4.5.5): it carries a typed reason of at least 10 characters,
 * kept in the audit row with the approval.
 */
export async function approveRun(user: AuthUser, id: string, reason?: string | null) {
  await canApprove(user);
  const why = String(reason ?? "").trim().slice(0, 500);
  assert(why.length >= 10, "Give a reason of at least 10 characters for approving this run.", 400);
  const campusId = campusOf(user);
  const calc = await prisma.payrollCalculation.findFirst({ where: { id, campusId } });
  assert(!!calc, "Run not found", 404);
  assert(calc.status === "DRAFT", calc.status === "STALE" ? "Inputs changed after approval. Prepare a new version." : `This version is ${calc.status.toLowerCase()}.`, 409);
  const policy = await prisma.payrollPolicy.findUniqueOrThrow({ where: { id: calc.policyId } });
  assert(!(policy.requireSeparation && calc.preparedById === user.userId), "You prepared this run. Another approver is required.");
  const blocking = (calc.exceptions as unknown as PayException[]).filter((e) => e.blocking);
  assert(!blocking.length, `Resolve before approval: ${blocking.map((e) => e.message).join(" ")}`, 409);
  if (await staleCheckDraft(calc)) throw new ApiError("Inputs changed since this version was prepared. Prepare a new version.", 409);
  const done = await prisma.payrollCalculation.updateMany({ where: { id, status: "DRAFT", inputHash: calc.inputHash }, data: { status: "APPROVED", approvedById: user.userId, approvedAt: new Date() } });
  assert(done.count === 1, "This version changed since you opened it.", 409);
  await writeAuditEvent(prisma, user, { table: "payroll_calculations", recordId: id, action: "APPROVE", campusId, after: { version: calc.version, totalNet: calc.totalNet, inputHash: calc.inputHash, reason: why } });
  return prisma.payrollCalculation.findUniqueOrThrow({ where: { id } });
}

async function staleCheckDraft(calc: { campusId: string; year: number; month: number; policyId: string; providerId: string; scopeUserIds: string[]; inputHash: string }) {
  const [policy, provider] = await Promise.all([prisma.payrollPolicy.findUniqueOrThrow({ where: { id: calc.policyId } }), prisma.payrollProvider.findUniqueOrThrow({ where: { id: calc.providerId } })]);
  return (await collectInputs(prisma, calc.campusId, calc.year, calc.month, rulesOf(policy), provider, calc.scopeUserIds)).hash !== calc.inputHash;
}

/** Another request exported this version first; the caller replays that submission. */
class Concurrent extends Error {}

type Row = { userId: string; providerEmployeeId: string; net: number; outcome: "PENDING" | "ACCEPTED" | "REJECTED"; reason?: string };

/**
 * Export an approved version. The first call creates the submission; any retry (a timeout, a double
 * click) returns the same reference and resends only rows without an outcome.
 */
export async function submitRun(user: AuthUser, id: string) {
  await canPrepare(user);
  const campusId = campusOf(user);
  const calc = await prisma.payrollCalculation.findFirst({ where: { id, campusId } });
  assert(!!calc, "Run not found", 404);
  const existing = await prisma.payrollSubmission.findUnique({ where: { calculationId: id } });
  if (existing) return retry(user, existing);
  assert(calc.status === "APPROVED", calc.status === "STALE" ? "Inputs changed after approval. Prepare and approve a new version." : "Only an approved version can be exported.", 409);
  if (await staleIfChanged(prisma, calc, "Inputs changed before export")) throw new ApiError("Inputs changed after approval; this version is now stale. Prepare and approve a new version.", 409);
  const provider = await prisma.payrollProvider.findUniqueOrThrow({ where: { id: calc.providerId } });
  const lines = calc.lines as unknown as PayLine[];
  const period = `${calc.year}-${String(calc.month).padStart(2, "0")}`;
  const reference = `PAY-${period.replace("-", "")}-V${calc.version}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const rows: Row[] = lines.map((l) => ({ userId: l.userId, providerEmployeeId: l.providerEmployeeId!, net: l.net, outcome: "PENDING" }));
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollCalculation.updateMany({ where: { id, status: "APPROVED" }, data: { status: "EXPORTED" } });
      if (claimed.count !== 1) throw new Concurrent();
      const submission = await tx.payrollSubmission.create({ data: { schoolId: user.schoolId, campusId, calculationId: id, reference, file: exportFile(provider.columns as { header: string; field: ExportField }[], lines, { currency: calc.currency, period, reference }), rows: json(rows), submittedById: user.userId, history: json([{ at: new Date().toISOString(), event: "SUBMITTED", rows: rows.length, by: user.userId }]) } });
      await writeAuditEvent(tx, user, { table: "payroll_submissions", recordId: submission.id, action: "CREATE", campusId, after: { reference, calculationId: id, rows: rows.length, totalNet: calc.totalNet } });
      return { submission, replayed: false, resent: rows.length };
    });
  } catch (error) {
    if (error instanceof Concurrent || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      const again = await prisma.payrollSubmission.findUnique({ where: { calculationId: id } });
      if (again) return retry(user, again);
      throw new ApiError("This version changed since you opened it.", 409);
    }
    throw error;
  }
}

async function retry(user: AuthUser, submission: { id: string; rows: Prisma.JsonValue; history: Prisma.JsonValue; reference: string }) {
  const pending = (submission.rows as Row[]).filter((r) => r.outcome === "PENDING").length;
  const updated = await prisma.payrollSubmission.update({ where: { id: submission.id }, data: { attempts: { increment: 1 }, lastAttemptAt: new Date(), history: push(submission.history, { event: "RETRY", resent: pending, by: user.userId }) } });
  return { submission: updated, replayed: true, resent: pending };
}

const ResultInput = z.object({ rows: z.array(z.object({ providerEmployeeId: text(1, 40), outcome: z.enum(["ACCEPTED", "REJECTED"]), reason: text(2, 300).optional() }).strict()).min(1).max(2000), acknowledgement: text(2, 120).optional() }).strict();

/** Record the provider's per-row outcome. An accepted row stays accepted. */
export async function recordProviderResult(user: AuthUser, submissionId: string, raw: unknown) {
  await canPrepare(user);
  const input = parse(ResultInput, raw), campusId = campusOf(user);
  const submission = await prisma.payrollSubmission.findFirst({ where: { id: submissionId, campusId } });
  assert(!!submission, "Submission not found", 404);
  const rows = (submission.rows as Row[]).map((r) => ({ ...r }));
  const ignored: string[] = [];
  for (const result of input.rows) {
    const row = rows.find((r) => r.providerEmployeeId === result.providerEmployeeId);
    assert(!!row, `${result.providerEmployeeId} is not in submission ${submission.reference}.`, 400);
    assert(result.outcome === "ACCEPTED" || !!result.reason, "A rejected row needs the provider's reason.", 400);
    if (row.outcome === "ACCEPTED") { if (result.outcome !== "ACCEPTED") ignored.push(result.providerEmployeeId); continue; }
    row.outcome = result.outcome;
    row.reason = result.reason;
  }
  const accepted = rows.filter((r) => r.outcome === "ACCEPTED").length, rejected = rows.filter((r) => r.outcome === "REJECTED").length;
  const status = accepted === rows.length ? "ACKNOWLEDGED" : rejected === rows.length ? "REJECTED" : "PARTIAL";
  const updated = await prisma.payrollSubmission.update({ where: { id: submission.id }, data: { rows: json(rows), status, acknowledgedAt: submission.acknowledgedAt ?? new Date(), history: push(submission.history, { event: "RESULT", accepted, rejected, acknowledgement: input.acknowledgement ?? null, ignoredChangesToAccepted: ignored, by: user.userId }) } });
  await writeAuditEvent(prisma, user, { table: "payroll_submissions", recordId: submission.id, action: "UPDATE", campusId, before: { status: submission.status }, after: { status, accepted, rejected } });
  return { submission: updated, ignored };
}

/** Rejected rows of a submission become a correction version that covers only them. */
export async function createCorrection(user: AuthUser, submissionId: string) {
  const campusId = campusOf(user);
  const submission = await prisma.payrollSubmission.findFirst({ where: { id: submissionId, campusId } });
  assert(!!submission, "Submission not found", 404);
  const calc = await prisma.payrollCalculation.findUniqueOrThrow({ where: { id: submission.calculationId } });
  return prepareRun(user, { year: calc.year, month: calc.month }, calc.id);
}

// ─── Overview ──────────────────────────────────────────────────

export async function payrollOverview(user: AuthUser, raw: unknown) {
  await canRead(user);
  const campusId = campusOf(user);
  const { year, month } = parse(Period, raw);
  const [policy, policies, providers, versions, staffCount, employees] = await Promise.all([
    policyFor(prisma, campusId, year, month),
    prisma.payrollPolicy.findMany({ where: { campusId }, orderBy: { version: "desc" }, take: 5 }),
    prisma.payrollProvider.findMany({ where: { campusId }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    prisma.payrollCalculation.findMany({ where: { campusId, year, month }, orderBy: { version: "desc" } }),
    prisma.user.count({ where: { campusId, isActive: true, staffProfile: { basicSalary: { gt: 0 } } } }),
    prisma.payrollEmployee.findMany({ where: { campusId }, select: { userId: true, providerIds: true, leavingDate: true } }),
  ]);
  const submissions = await prisma.payrollSubmission.findMany({ where: { calculationId: { in: versions.map((v) => v.id) } } });
  const correctedFrom = new Set(versions.filter((v) => v.correctionOfId && v.status !== "SUPERSEDED").map((v) => v.correctionOfId));
  const corrections = submissions.flatMap((s) => (s.rows as Row[]).filter((r) => r.outcome === "REJECTED").map((r) => ({ ...r, submissionId: s.id, reference: s.reference, calculationId: s.calculationId, correctionStarted: correctedFrom.has(s.calculationId) })));
  const latestProviders = providers.filter((p, i) => providers.findIndex((q) => q.code === p.code) === i);
  const flags = await Promise.all([canPrepare(user).then(() => true, () => false), canApprove(user).then(() => true, () => false)]);
  return { period: { year, month }, policy, policies, providers: latestProviders, versions, submissions, corrections, staffCount, employees, canPrepare: flags[0], canApprove: flags[1] };
}
