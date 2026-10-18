import { z } from "zod";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

/**
 * SKO-425: learning actions — the structured form of InterventionPlan.
 *
 * A concern becomes a draft with evidence, a goal, a responsible adult and
 * dates. AI text stays a draft; only a school leader activates a plan, and
 * only when it has evidence, goal, owner, a review date and a next check-in.
 * Check-ins record what was actually delivered and how the learner took part,
 * separately from learning evidence. The review compares the baseline with
 * fresh follow-up evidence and never claims the action caused a change.
 * Every decision needs a human reason; every change keeps a snapshot in
 * InterventionEvent. Private notes stay with staff; families see only the
 * explicitly shared goal and action.
 */

const day = z.string().date();
const evidenceRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MARK"), refId: z.string().min(1), label: z.string().trim().min(2).max(200) }).strict(),
  z.object({ kind: z.literal("ASSIGNMENT_SUBMISSION"), refId: z.string().min(1), label: z.string().trim().min(2).max(200) }).strict(),
  z.object({ kind: z.literal("OBSERVATION"), refId: z.string().min(1).max(60), label: z.string().trim().min(10).max(500) }).strict(),
  // SKO-422: a reviewed exam attempt, cited from question-level evidence.
  z.object({ kind: z.literal("EXAM_ATTEMPT"), refId: z.string().min(1), label: z.string().trim().min(2).max(200) }).strict(),
]);
const measure = z.object({ measure: z.string().trim().min(3).max(200), value: z.number().min(0).max(100000).nullable(), denominator: z.number().int().min(1).max(100000).nullable(), takenOn: day, source: z.string().trim().min(3).max(200) }).strict();
export const DraftInput = z.object({
  id: z.string().min(1).optional(), version: z.number().int().min(0),
  studentId: z.string().min(1), subjectId: z.string().min(1).nullable().optional(), title: z.string().trim().min(3).max(160),
  concern: z.string().trim().max(2000).nullable().optional(), evidenceState: z.enum(["CONFIRMED", "NEEDS_OBSERVATION"]),
  evidenceRefs: z.array(evidenceRef).max(20), baseline: measure.nullable().optional(),
  goal: z.string().trim().max(500).nullable().optional(), ownerId: z.string().min(1).nullable().optional(),
  plannedActivity: z.string().trim().max(2000).nullable().optional(), minutesPerWeek: z.number().int().min(5).max(600).nullable().optional(),
  lessonPlanRef: z.object({ curriculumId: z.string().min(1), planId: z.string().min(1) }).strict().nullable().optional(),
  reviewDate: day.nullable().optional(), nextCheckInDate: day.nullable().optional(),
  familyShare: z.object({ goal: z.string().trim().min(10).max(500), action: z.string().trim().min(10).max(500) }).strict().nullable().optional(),
  privateNotes: z.string().trim().max(4000).nullable().optional(),
}).strict();

/** Invalid input is the caller's mistake (400), never a server failure. */
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ? `Check the form: ${result.error.issues[0].path.join(".") || "input"} — ${result.error.issues[0].message}` : "Check the form and try again", 400);
  return result.data;
}
const today = () => new Date().toISOString().slice(0, 10);
const asDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const ymd = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
type Plan = NonNullable<Awaited<ReturnType<typeof prisma.interventionPlan.findFirst>>>;

function isLeader(user: AuthUser) { return canManageOperations(user); }
function canManage(user: AuthUser, plan: Pick<Plan, "ownerId" | "createdBy">) { return isLeader(user) || plan.ownerId === user.userId || (!plan.ownerId && plan.createdBy === user.userId); }
function assertStaff(user: AuthUser) {
  if (!isLeader(user) && user.role !== "TEACHER") throw new ApiError("Learning actions are for school staff", 403);
}

async function loadPlan(tx: TxClient, user: AuthUser, id: string) {
  const plan = await tx.interventionPlan.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) } });
  if (!plan || !canManage(user, plan)) throw new ApiError("Learning action not found", 404);
  return plan;
}

const snapshot = (plan: Plan) => ({ status: plan.status, goal: plan.goal, ownerId: plan.ownerId, reviewDate: ymd(plan.reviewDate), nextCheckInDate: ymd(plan.nextCheckInDate), evidenceRefs: plan.evidenceRefs, baseline: plan.baseline, plannedActivity: plan.plannedActivity, familyShare: plan.familyShare, outcome: plan.outcome });

async function bump(tx: TxClient, user: AuthUser, plan: Plan, expectedVersion: number, data: Record<string, unknown>, kind: string, reason?: string | null) {
  const changed = await tx.interventionPlan.updateMany({ where: { id: plan.id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } as never });
  if (!changed.count) throw new ApiError("This learning action changed meanwhile. Reload and review it again.", 409);
  const saved = await tx.interventionPlan.findUniqueOrThrow({ where: { id: plan.id } });
  // The event keeps the version as it now stands, so every prior version stays readable.
  await tx.interventionEvent.create({ data: { schoolId: user.schoolId, planId: plan.id, version: saved.version, kind, actorId: user.userId, reason: reason ?? null, snapshot: snapshot(saved) as never } });
  return saved;
}

async function assertOwner(tx: TxClient, user: AuthUser, campusId: string, ownerId: string) {
  const owner = await tx.user.findFirst({ where: { id: ownerId, schoolId: user.schoolId, campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN"] } }, select: { id: true } });
  if (!owner) throw new ApiError("The responsible adult must be active staff on this campus", 400);
}

async function assertEvidence(tx: TxClient, user: AuthUser, studentId: string, refs: z.infer<typeof evidenceRef>[]) {
  for (const ref of refs) {
    if (ref.kind === "MARK" && !(await tx.mark.findFirst({ where: { id: ref.refId, studentId }, select: { id: true } }))) throw new ApiError("Evidence must be this learner's own mark", 400);
    if (ref.kind === "ASSIGNMENT_SUBMISSION" && !(await tx.assignmentSubmission.findFirst({ where: { id: ref.refId, studentId }, select: { id: true } }))) throw new ApiError("Evidence must be this learner's own submission", 400);
    if (ref.kind === "EXAM_ATTEMPT" && !(await tx.schoolAiExamAttempt.findFirst({ where: { id: ref.refId, studentId, schoolId: user.schoolId, status: "REVIEWED" }, select: { id: true } }))) throw new ApiError("Evidence must be this learner's own reviewed attempt", 400);
  }
}

/** Create or edit a draft (or an active plan, which bumps its version and keeps the prior snapshot). */
export async function saveLearningAction(user: AuthUser, raw: unknown) {
  assertStaff(user);
  const input = parse(DraftInput, raw);
  return schoolAiTransaction(user, async tx => {
    const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: user.campusId ?? "", archivedAt: null }, select: { id: true, classId: true, campusId: true } });
    if (!student) throw new ApiError("Learner not found on this campus", 404);
    if (user.role === "TEACHER" && !(await tx.subject.findFirst({ where: { classId: student.classId, teacherId: user.userId }, select: { id: true } })) && !(await tx.class.findFirst({ where: { id: student.classId, classTeacherId: user.userId }, select: { id: true } }))) throw new ApiError("You can plan support only for learners you teach", 403);
    if (input.ownerId) await assertOwner(tx, user, student.campusId, input.ownerId);
    await assertEvidence(tx, user, student.id, input.evidenceRefs);
    const data = {
      studentId: student.id, classId: student.classId, subjectId: input.subjectId ?? null, title: input.title, summary: input.concern ?? "",
      concern: input.concern ?? null, evidenceState: input.evidenceState, evidenceRefs: input.evidenceRefs, baseline: input.baseline ?? undefined,
      goal: input.goal ?? null, ownerId: input.ownerId ?? null, plannedActivity: input.plannedActivity ?? null, minutesPerWeek: input.minutesPerWeek ?? null,
      lessonPlanRef: input.lessonPlanRef ?? undefined, reviewDate: asDate(input.reviewDate), nextCheckInDate: asDate(input.nextCheckInDate),
      familyShare: input.familyShare ? { ...input.familyShare, sharedAt: null, sharedVersion: null } : undefined, privateNotes: input.privateNotes ?? null,
    };
    if (!input.id) {
      const created = await tx.interventionPlan.create({ data: { schoolId: user.schoolId, campusId: student.campusId, createdBy: user.userId, status: "DRAFT", origin: "TEACHER", ...data } as never });
      await tx.interventionEvent.create({ data: { schoolId: user.schoolId, planId: created.id, version: 1, kind: "CREATED", actorId: user.userId, snapshot: snapshot(created) as never } });
      return { id: created.id, version: created.version, status: created.status };
    }
    const plan = await loadPlan(tx, user, input.id);
    if (["CLOSED", "REJECTED"].includes(plan.status)) throw new ApiError("A closed learning action cannot be edited. Start a new one.", 409);
    // Sharing state is kept: an edit to the shared text must be shared again explicitly.
    const prior = plan.familyShare as { goal: string; action: string; sharedAt: string | null; sharedVersion: number | null } | null;
    const share = input.familyShare ? { ...input.familyShare, sharedAt: prior && prior.goal === input.familyShare.goal && prior.action === input.familyShare.action ? prior.sharedAt : null, sharedVersion: prior && prior.goal === input.familyShare.goal && prior.action === input.familyShare.action ? prior.sharedVersion : null } : null;
    const saved = await bump(tx, user, plan, input.version, { ...data, familyShare: share ?? undefined }, plan.status === "ACTIVE" ? "EDITED_ACTIVE" : "EDITED");
    return { id: saved.id, version: saved.version, status: saved.status };
  });
}

/** Only a leader activates, and only a complete plan: evidence, goal, owner, review date and next check-in. */
export async function activateLearningAction(user: AuthUser, id: string, version: number) {
  if (!isLeader(user)) throw new ApiError("Only an authorized school leader can activate a learning action", 403);
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    if (plan.status !== "DRAFT") throw new ApiError("Only a draft can be activated", 409);
    const missing: string[] = [];
    if (!plan.goal || plan.goal.trim().length < 10) missing.push("a specific goal");
    if (!plan.ownerId) missing.push("a responsible adult");
    if (!(plan.evidenceRefs as unknown[]).length) missing.push("at least one piece of source evidence");
    if (!plan.reviewDate || ymd(plan.reviewDate)! <= today()) missing.push("a review date in the future");
    if (!plan.nextCheckInDate || (plan.reviewDate && plan.nextCheckInDate > plan.reviewDate)) missing.push("a next check-in on or before the review date");
    if (missing.length) throw new ApiError(`Add ${missing.join(", ")} before activating.`, 409);
    const saved = await bump(tx, user, plan, version, { status: "ACTIVE", approvedBy: user.userId, approvedAt: new Date() }, "ACTIVATED");
    return { id: saved.id, version: saved.version, status: saved.status };
  });
}

/** Share only the approved goal and action with the family; private notes and evidence never go. */
export async function shareLearningAction(user: AuthUser, id: string, version: number) {
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    const share = plan.familyShare as { goal: string; action: string } | null;
    if (plan.status !== "ACTIVE") throw new ApiError("Share a learning action after it is activated", 409);
    if (!share) throw new ApiError("Write the family goal and action first", 400);
    const saved = await bump(tx, user, plan, version, { familyShare: { ...share, sharedAt: new Date().toISOString(), sharedVersion: version + 1 } }, "SHARED_WITH_FAMILY");
    return { id: saved.id, version: saved.version };
  });
}

const CheckInput = z.object({ version: z.number().int().min(1), dueOn: day, delivered: z.boolean(), minutes: z.number().int().min(0).max(600).nullable(), participation: z.enum(["FULL", "PARTIAL", "ABSENT"]), adjustment: z.string().trim().max(1000).nullable(), pupilFeedback: z.string().trim().max(1000).nullable(), nextCheckInDate: day.nullable() }).strict();
/** What actually happened — delivery and participation, kept apart from learning evidence. */
export async function recordCheckIn(user: AuthUser, id: string, raw: unknown) {
  const input = parse(CheckInput, raw);
  if (input.dueOn > today()) throw new ApiError("Record a check-in on or after the day it happened", 400);
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    if (plan.status !== "ACTIVE") throw new ApiError("Check-ins are for active learning actions", 409);
    if (input.nextCheckInDate && input.nextCheckInDate <= today()) throw new ApiError("The next check-in must be in the future", 400);
    await tx.interventionCheckIn.create({ data: { schoolId: user.schoolId, planId: plan.id, planVersion: plan.version, dueOn: asDate(input.dueOn)!, delivered: input.delivered, minutes: input.minutes, participation: input.participation, adjustment: input.adjustment, pupilFeedback: input.pupilFeedback, recordedById: user.userId } });
    const saved = await bump(tx, user, plan, input.version, { nextCheckInDate: asDate(input.nextCheckInDate) }, "CHECK_IN");
    return { id: saved.id, version: saved.version, nextCheckInDate: ymd(saved.nextCheckInDate) };
  });
}

/** Missed check-ins stay visible until they are recorded or rescheduled with a reason. */
export async function rescheduleCheckIn(user: AuthUser, id: string, raw: unknown) {
  const input = parse(z.object({ version: z.number().int().min(1), nextCheckInDate: day, reason: z.string().trim().min(10).max(500) }).strict(), raw);
  if (input.nextCheckInDate <= today()) throw new ApiError("Choose a future date", 400);
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    if (plan.status !== "ACTIVE") throw new ApiError("Only an active learning action has check-ins", 409);
    const saved = await bump(tx, user, plan, input.version, { nextCheckInDate: asDate(input.nextCheckInDate) }, "RESCHEDULED", input.reason);
    return { id: saved.id, version: saved.version };
  });
}

/** Ownership moves explicitly; unfinished work never loses its responsible adult. */
export async function handOffLearningAction(user: AuthUser, id: string, raw: unknown) {
  const input = parse(z.object({ version: z.number().int().min(1), ownerId: z.string().min(1), reason: z.string().trim().min(10).max(500) }).strict(), raw);
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    if (!isLeader(user) && plan.ownerId !== user.userId) throw new ApiError("Only the current owner or a leader can hand this over", 403);
    if (["CLOSED", "REJECTED"].includes(plan.status)) throw new ApiError("A closed learning action has no owner to change", 409);
    await assertOwner(tx, user, plan.campusId, input.ownerId);
    const saved = await bump(tx, user, plan, input.version, { ownerId: input.ownerId }, "OWNER_CHANGED", input.reason);
    return { id: saved.id, version: saved.version, ownerId: saved.ownerId };
  });
}

const ReviewInput = z.object({
  version: z.number().int().min(1), decision: z.enum(["CLOSE", "EXTEND", "ESCALATE", "INCONCLUSIVE"]), reason: z.string().trim().min(10).max(1000),
  followUp: measure.extend({ comparable: z.boolean(), differences: z.string().trim().max(500) }).nullable(), limitations: z.string().trim().max(1000),
  nextReviewDate: day.nullable(), nextOwnerId: z.string().min(1).nullable(),
}).strict();
/**
 * The outcome review. Closing as complete needs fresh follow-up evidence;
 * participation alone is never an outcome. The comparison states whether the
 * follow-up was comparable and what differed, and makes no causal claim.
 */
export async function reviewLearningAction(user: AuthUser, id: string, raw: unknown) {
  const input = parse(ReviewInput, raw);
  return schoolAiTransaction(user, async tx => {
    const plan = await loadPlan(tx, user, id);
    if (plan.status !== "ACTIVE") throw new ApiError("Only an active learning action can be reviewed", 409);
    if (input.decision === "CLOSE" && !input.followUp) throw new ApiError("Closing needs follow-up evidence. Record it, or choose Inconclusive.", 409);
    if (input.decision === "EXTEND" && (!input.nextReviewDate || input.nextReviewDate <= today())) throw new ApiError("Extending needs a new review date in the future", 400);
    if (input.decision === "ESCALATE" && !input.nextOwnerId) throw new ApiError("Escalating needs the person who takes it on", 400);
    if (input.nextOwnerId) await assertOwner(tx, user, plan.campusId, input.nextOwnerId);
    const checkIns = await tx.interventionCheckIn.findMany({ where: { planId: plan.id } });
    const participation = { checkIns: checkIns.length, delivered: checkIns.filter(c => c.delivered).length, minutes: checkIns.reduce((sum, c) => sum + (c.minutes ?? 0), 0), absent: checkIns.filter(c => c.participation === "ABSENT").length };
    const outcome = { decision: input.decision, reason: input.reason, baseline: plan.baseline, followUp: input.followUp, limitations: input.limitations, participation,
      note: "This compares evidence before and after the action. It does not show that the action caused any change.", decidedById: user.userId, decidedAt: new Date().toISOString() };
    const next = input.decision === "EXTEND" ? { status: "ACTIVE", reviewDate: asDate(input.nextReviewDate), ...(input.nextOwnerId ? { ownerId: input.nextOwnerId } : {}) }
      : input.decision === "ESCALATE" ? { status: "ESCALATED", ownerId: input.nextOwnerId }
      : { status: "CLOSED", nextCheckInDate: null };
    const saved = await bump(tx, user, plan, input.version, { ...next, outcome }, `REVIEW_${input.decision}`, input.reason);
    return { id: saved.id, version: saved.version, status: saved.status, outcome };
  });
}

export async function listLearningActions(user: AuthUser, studentId?: string | null) {
  assertStaff(user);
  const rows = await prisma.interventionPlan.findMany({
    where: { schoolId: user.schoolId, campusId: user.campusId ?? "", ...(studentId ? { studentId } : {}), ...(isLeader(user) ? {} : { OR: [{ ownerId: user.userId }, { ownerId: null, createdBy: user.userId }] }), status: { not: "REJECTED" } },
    orderBy: [{ status: "asc" }, { nextCheckInDate: "asc" }], take: 200,
  });
  const people = new Map((await prisma.user.findMany({ where: { id: { in: rows.flatMap(r => [r.ownerId, r.createdBy]).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  const learners = new Map((await prisma.student.findMany({ where: { id: { in: rows.map(r => r.studentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map(s => [s.id, s.fullName]));
  const now = today();
  return rows.map(r => ({
    id: r.id, version: r.version, status: r.status, origin: r.origin, title: r.title, learner: r.studentId ? learners.get(r.studentId) ?? "" : "", studentId: r.studentId,
    goal: r.goal, owner: r.ownerId ? people.get(r.ownerId) ?? "" : null, ownerId: r.ownerId, reviewDate: ymd(r.reviewDate), nextCheckInDate: ymd(r.nextCheckInDate),
    checkInOverdue: r.status === "ACTIVE" && Boolean(r.nextCheckInDate && ymd(r.nextCheckInDate)! < now), reviewDue: r.status === "ACTIVE" && Boolean(r.reviewDate && ymd(r.reviewDate)! <= now),
    shared: Boolean((r.familyShare as { sharedAt?: string | null } | null)?.sharedAt),
    // SKO-472: an approved assessment repair changed evidence this action cites.
    staleSince: r.staleSince?.toISOString() ?? null, staleReason: r.staleReason,
  }));
}

export async function getLearningAction(user: AuthUser, id: string) {
  assertStaff(user);
  const plan = await loadPlan(prisma, user, id);
  const [checkIns, events] = await Promise.all([
    prisma.interventionCheckIn.findMany({ where: { planId: id }, orderBy: { dueOn: "asc" } }),
    prisma.interventionEvent.findMany({ where: { planId: id }, orderBy: { createdAt: "asc" } }),
  ]);
  return { ...plan, reviewDate: ymd(plan.reviewDate), nextCheckInDate: ymd(plan.nextCheckInDate), checkIns: checkIns.map(c => ({ ...c, dueOn: ymd(c.dueOn) })), events };
}

/** Family projection: only goals and actions the school explicitly shared, for the guardian's own child. */
export async function familyLearningActions(studentId: string, schoolId: string) {
  const rows = await prisma.interventionPlan.findMany({ where: { schoolId, studentId, status: { in: ["ACTIVE", "CLOSED"] } }, select: { id: true, status: true, familyShare: true, reviewDate: true } });
  return rows.flatMap(r => {
    const share = r.familyShare as { goal: string; action: string; sharedAt: string | null } | null;
    return share?.sharedAt ? [{ id: r.id, goal: share.goal, action: share.action, sharedAt: share.sharedAt, reviewDate: ymd(r.reviewDate), active: r.status === "ACTIVE" }] : [];
  });
}

/** Who the user may plan for and who may own a learning action, for the editor's pickers. */
export async function learningActionContext(user: AuthUser) {
  assertStaff(user);
  const campusId = user.campusId ?? "";
  const classIds = isLeader(user) ? null : [...new Set([
    ...(await prisma.subject.findMany({ where: { campusId, teacherId: user.userId }, select: { classId: true } })).map(s => s.classId),
    ...(await prisma.class.findMany({ where: { campusId, classTeacherId: user.userId }, select: { id: true } })).map(c => c.id),
  ])];
  const [learners, staff] = await Promise.all([
    prisma.student.findMany({ where: { schoolId: user.schoolId, campusId, archivedAt: null, ...(classIds ? { classId: { in: classIds } } : {}) }, select: { id: true, fullName: true, rollNo: true }, orderBy: { fullName: "asc" }, take: 500 }),
    prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 }),
  ]);
  return { learners: learners.map(l => ({ id: l.id, name: l.fullName, rollNo: l.rollNo })), staff: staff.map(s => ({ id: s.id, name: s.fullName })), leader: isLeader(user), userId: user.userId };
}
