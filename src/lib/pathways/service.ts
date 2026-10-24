import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { guardianHasAccess } from "@/lib/parent/guardian-access";

/**
 * SKO-455 careers, counselling and alumni pathways.
 *
 * - The student owns their goals and chooses who else sees each one (counsellor, guardian).
 * - Actions carry a deadline and an owner; nothing here predicts admission or scores potential.
 * - Counselling notes are separate: only staff a school leader designated as counsellors read them,
 *   every read or refusal is logged, and no export or guardian summary ever includes them.
 * - Opportunities show their source and when they were last checked; a passed deadline or an old
 *   check is labelled, and withdrawn ones disappear.
 * - Alumni take part only with recorded, revocable consent, are adults to mentor, and are re-reviewed
 *   yearly; withdrawal hides them and cancels open requests. Mentoring is school-mediated: a
 *   counsellor approves after the school's safeguarding check and, for a minor, guardian consent.
 */

const LEADERS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"];
const STAFF = [...LEADERS, "TEACHER"];
const AUDIENCES = ["COUNSELLOR", "GUARDIAN"] as const;
const STALE_DAYS = 90;
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const day = z.iso.date();
const json = (value: unknown) => value as Prisma.InputJsonValue;
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const today = () => asDate(new Date().toISOString().slice(0, 10));
const push = (history: Prisma.JsonValue, entry: Record<string, unknown>) => [...(Array.isArray(history) ? history : []), { at: new Date().toISOString(), ...entry }] as Prisma.InputJsonValue;

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
function campusOf(user: AuthUser) { assert(!!user.campusId, "Choose a campus first.", 400); return user.campusId!; }
export function ageOn(dob: Date | null | undefined, at = new Date()) {
  if (!dob) return null;
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  if (at.getUTCMonth() < dob.getUTCMonth() || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

async function isCounsellor(user: AuthUser) {
  if (!STAFF.includes(user.role) || !user.campusId) return false;
  return !!(await prisma.pathwayCounsellor.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, revokedAt: null } }));
}
async function counsellor(user: AuthUser) {
  assert(await isCounsellor(user), "This is restricted to designated counsellors.");
}
async function ownStudent(user: AuthUser) {
  assert(user.role === "STUDENT", "Only the student edits their own plan.");
  const student = await prisma.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true, campusId: true, dateOfBirth: true, fullName: true } });
  assert(!!student, "Student record not found", 404);
  return student;
}
async function logAccess(user: AuthUser, recordType: string, studentId: string | null, action: string, recordId?: string) {
  await prisma.confidentialAccessLog.create({ data: { schoolId: user.schoolId, actorId: user.userId, domain: "COUNSELLING", recordType, recordId: recordId ?? null, studentId, action } });
}

/** What of a student's plan this person may see: everything for the student, the audience's goals
 * for a designated counsellor or a guardian with learning-records access, nothing otherwise. */
async function planScope(user: AuthUser, studentId: string): Promise<"OWNER" | "COUNSELLOR" | "GUARDIAN"> {
  if (user.role === "STUDENT") { const s = await ownStudent(user); assert(s.id === studentId, "Not found", 404); return "OWNER"; }
  if (user.role === "PARENT") { assert(!!(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "learningRecords" })), "Not found", 404); return "GUARDIAN"; }
  assert(await isCounsellor(user), "Pathway plans are shared with designated counsellors only.");
  const s = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, campusId: user.campusId ?? "" }, select: { id: true } });
  assert(!!s, "Not found", 404);
  return "COUNSELLOR";
}

// ─── Counsellors ────────────────────────────────────────────────

export async function designateCounsellor(user: AuthUser, raw: unknown) {
  assert(LEADERS.includes(user.role), "Only school leaders designate counsellors.");
  const { userId } = parse(z.object({ userId: text(1, 120) }).strict(), raw);
  const campusId = campusOf(user);
  const staff = await prisma.user.findFirst({ where: { id: userId, schoolId: user.schoolId, campusId, isActive: true, role: { in: STAFF as never[] } }, select: { id: true } });
  assert(!!staff, "Choose a staff member at this campus.", 400);
  const existing = await prisma.pathwayCounsellor.findFirst({ where: { schoolId: user.schoolId, campusId, userId, revokedAt: null } });
  return existing ?? prisma.pathwayCounsellor.create({ data: { schoolId: user.schoolId, campusId, userId, grantedById: user.userId } });
}
export async function revokeCounsellor(user: AuthUser, id: string) {
  assert(LEADERS.includes(user.role), "Only school leaders change designations.");
  const done = await prisma.pathwayCounsellor.updateMany({ where: { id, schoolId: user.schoolId, revokedAt: null }, data: { revokedAt: new Date() } });
  assert(done.count === 1, "Designation not found", 404);
  return { revoked: id };
}

// ─── Goals and actions ──────────────────────────────────────────

const GoalInput = z.object({ title: text(3, 160), detail: text(0, 1000).optional(), audience: z.array(z.enum(AUDIENCES)).max(2), nextReviewOn: day.nullable().optional(), status: z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]).optional() }).strict();

export async function saveGoal(user: AuthUser, raw: unknown, id?: string) {
  const student = await ownStudent(user);
  const input = parse(GoalInput, raw);
  const data = { title: input.title, detail: input.detail || null, audience: [...new Set(input.audience)], nextReviewOn: input.nextReviewOn ? asDate(input.nextReviewOn) : null, ...(input.status ? { status: input.status } : {}) };
  if (!id) return prisma.pathwayGoal.create({ data: { ...data, schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, createdById: user.userId } });
  const done = await prisma.pathwayGoal.updateMany({ where: { id, studentId: student.id }, data });
  assert(done.count === 1, "Goal not found", 404);
  return prisma.pathwayGoal.findUniqueOrThrow({ where: { id } });
}

const ActionInput = z.object({ goalId: text(1, 120), title: text(3, 200), owner: z.enum(["STUDENT", "COUNSELLOR", "GUARDIAN"]), dueOn: day, opportunityId: text(1, 120).nullable().optional(), evidenceLink: z.url().max(500).nullable().optional() }).strict();

/** The student, or a counsellor on a goal shared with counsellors, agrees a next action. */
export async function addAction(user: AuthUser, raw: unknown) {
  const input = parse(ActionInput, raw);
  const goal = await prisma.pathwayGoal.findFirst({ where: { id: input.goalId, schoolId: user.schoolId } });
  assert(!!goal, "Goal not found", 404);
  const scope = await planScope(user, goal.studentId);
  assert(scope === "OWNER" || (scope === "COUNSELLOR" && goal.audience.includes("COUNSELLOR")), "Only the student or a counsellor the goal is shared with adds actions.");
  if (input.opportunityId) assert(!!(await prisma.pathwayOpportunity.findFirst({ where: { id: input.opportunityId, schoolId: user.schoolId, status: "ACTIVE" } })), "That opportunity is not available.", 400);
  return prisma.pathwayAction.create({ data: { schoolId: user.schoolId, goalId: goal.id, studentId: goal.studentId, title: input.title, owner: input.owner, dueOn: asDate(input.dueOn), opportunityId: input.opportunityId ?? null, evidenceLink: input.evidenceLink ?? null, createdById: user.userId } });
}

export async function completeAction(user: AuthUser, id: string) {
  const action = await prisma.pathwayAction.findFirst({ where: { id, schoolId: user.schoolId } });
  assert(!!action, "Action not found", 404);
  const scope = await planScope(user, action.studentId);
  assert(scope !== "GUARDIAN", "Guardians can see shared actions but not change them.");
  return prisma.pathwayAction.update({ where: { id }, data: { status: "DONE", doneAt: new Date() } });
}

/** A plan as one audience may see it. Counselling notes are never part of a plan. */
async function planFor(studentId: string, scope: "OWNER" | "COUNSELLOR" | "GUARDIAN") {
  const goals = await prisma.pathwayGoal.findMany({ where: { studentId, status: { not: "ARCHIVED" }, ...(scope === "OWNER" ? {} : { audience: { has: scope } }) }, orderBy: { createdAt: "asc" } });
  const actions = await prisma.pathwayAction.findMany({ where: { goalId: { in: goals.map((g) => g.id) } }, orderBy: { dueOn: "asc" } });
  return goals.map((g) => ({ ...g, actions: actions.filter((a) => a.goalId === g.id) }));
}

/** A shareable plan export. It never includes counselling notes or appointment reasons. */
export async function exportPlan(user: AuthUser, studentId: string) {
  const scope = await planScope(user, studentId);
  const student = await prisma.student.findFirstOrThrow({ where: { id: studentId }, select: { fullName: true } });
  const plan = await planFor(studentId, scope);
  const lines = [`Pathway plan — ${student.fullName}`, "Suggestions are options, not predictions. Private counselling notes are not included.", ""];
  for (const g of plan) {
    lines.push(`Goal: ${g.title} (${g.status.toLowerCase()})${g.audience.length ? ` · shared with ${g.audience.map((a) => a.toLowerCase()).join(", ")}` : " · private to the student"}`);
    for (const a of g.actions) lines.push(`  - ${a.title} · owner ${a.owner.toLowerCase()} · due ${a.dueOn.toISOString().slice(0, 10)} · ${a.status === "DONE" ? "done" : "open"}`);
  }
  return { scope, text: lines.join("\n") };
}

// ─── Opportunities ──────────────────────────────────────────────

const OpportunityInput = z.object({ title: text(3, 200), provider: text(2, 200), kind: z.enum(["UNIVERSITY", "SCHOLARSHIP", "INTERNSHIP", "COURSE", "OTHER"]), sourceUrl: z.url().max(500), eligibility: text(3, 1000), deadline: day.nullable().optional() }).strict();

async function opportunityEditor(user: AuthUser) { assert(LEADERS.includes(user.role) || (await isCounsellor(user)), "Only counsellors and school leaders manage opportunities."); }

export async function saveOpportunity(user: AuthUser, raw: unknown) {
  await opportunityEditor(user);
  const input = parse(OpportunityInput, raw);
  return prisma.pathwayOpportunity.create({ data: { ...input, deadline: input.deadline ? asDate(input.deadline) : null, schoolId: user.schoolId, campusId: campusOf(user), lastVerifiedAt: new Date(), verifiedById: user.userId } });
}
export async function verifyOpportunity(user: AuthUser, id: string, raw: unknown) {
  await opportunityEditor(user);
  const { outcome, deadline } = parse(z.object({ outcome: z.enum(["CONFIRMED", "WITHDRAWN"]), deadline: day.nullable().optional() }).strict(), raw);
  const data = outcome === "WITHDRAWN" ? { status: "WITHDRAWN", lastVerifiedAt: new Date(), verifiedById: user.userId } : { lastVerifiedAt: new Date(), verifiedById: user.userId, ...(deadline !== undefined ? { deadline: deadline ? asDate(deadline) : null } : {}) };
  const done = await prisma.pathwayOpportunity.updateMany({ where: { id, schoolId: user.schoolId }, data });
  assert(done.count === 1, "Opportunity not found", 404);
  return prisma.pathwayOpportunity.findUniqueOrThrow({ where: { id } });
}
export function opportunityState(o: { deadline: Date | null; lastVerifiedAt: Date; status: string }, now = new Date()) {
  if (o.status === "WITHDRAWN") return "WITHDRAWN";
  if (o.deadline && o.deadline < asDate(now.toISOString().slice(0, 10))) return "DEADLINE_PASSED";
  if (now.getTime() - o.lastVerifiedAt.getTime() > STALE_DAYS * 86_400_000) return "NEEDS_VERIFICATION";
  return "CURRENT";
}

// ─── Appointments and confidential notes ────────────────────────

export async function requestAppointment(user: AuthUser, raw: unknown) {
  const student = await ownStudent(user);
  const input = parse(z.object({ counsellorId: text(1, 120), startsAt: z.iso.datetime(), minutes: z.number().int().min(10).max(120) }).strict(), raw);
  assert(!!(await prisma.pathwayCounsellor.findFirst({ where: { schoolId: user.schoolId, campusId: student.campusId, userId: input.counsellorId, revokedAt: null } })), "Choose a designated counsellor.", 400);
  assert(new Date(input.startsAt) > new Date(), "Choose a future time.", 400);
  return prisma.counsellingAppointment.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, counsellorId: input.counsellorId, startsAt: new Date(input.startsAt), minutes: input.minutes, publicLabel: "Pathway meeting", requestedById: user.userId } });
}
export async function updateAppointment(user: AuthUser, id: string, raw: unknown) {
  const { status } = parse(z.object({ status: z.enum(["CONFIRMED", "HELD", "CANCELLED"]) }).strict(), raw);
  const appt = await prisma.counsellingAppointment.findFirst({ where: { id, schoolId: user.schoolId } });
  assert(!!appt, "Appointment not found", 404);
  if (user.role === "STUDENT") { const s = await ownStudent(user); assert(s.id === appt.studentId && status === "CANCELLED", "Students can cancel their own requests only."); }
  else assert(appt.counsellorId === user.userId && (await isCounsellor(user)), "Only the student's counsellor updates this appointment.");
  return prisma.counsellingAppointment.update({ where: { id }, data: { status } });
}

export async function addNote(user: AuthUser, raw: unknown) {
  const input = parse(z.object({ studentId: text(1, 120), appointmentId: text(1, 120).nullable().optional(), body: text(3, 5000) }).strict(), raw);
  if (!(await isCounsellor(user))) { await logAccess(user, "NOTE", input.studentId, "DENIED"); throw new ApiError("These counselling notes are restricted to designated staff.", 403); }
  const student = await prisma.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: user.campusId ?? "" }, select: { id: true, campusId: true } });
  assert(!!student, "Student not found", 404);
  const note = await prisma.counsellingNote.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, appointmentId: input.appointmentId ?? null, authorId: user.userId, body: input.body } });
  await logAccess(user, "NOTE", student.id, "CREATE", note.id);
  return { id: note.id, createdAt: note.createdAt };
}
export async function readNotes(user: AuthUser, studentId: string) {
  if (!(await isCounsellor(user))) { await logAccess(user, "NOTE", studentId, "DENIED"); throw new ApiError("These counselling notes are restricted to designated staff.", 403); }
  const notes = await prisma.counsellingNote.findMany({ where: { schoolId: user.schoolId, campusId: user.campusId ?? "", studentId }, orderBy: { createdAt: "desc" } });
  await logAccess(user, "NOTE", studentId, "VIEW");
  return notes;
}

// ─── Alumni and mentoring ───────────────────────────────────────

const AlumniInput = z.object({ studentId: text(1, 120).nullable().optional(), displayName: text(2, 120), pathway: text(3, 200), contactEmail: z.email().max(200), dateOfBirth: day, visibility: z.enum(["STAFF_ONLY", "STUDENTS"]), mentoring: z.boolean(), consentEvidence: text(5, 300) }).strict();

export async function recordAlumni(user: AuthUser, raw: unknown) {
  await counsellor(user);
  const input = parse(AlumniInput, raw);
  const age = ageOn(asDate(input.dateOfBirth));
  assert(age !== null && age >= 18, "Alumni take part as adults only. Record them again once they are 18.", 409);
  const next = new Date(); next.setUTCFullYear(next.getUTCFullYear() + 1);
  return prisma.alumniProfile.create({ data: { ...input, studentId: input.studentId ?? null, dateOfBirth: asDate(input.dateOfBirth), schoolId: user.schoolId, campusId: campusOf(user), consentGivenAt: new Date(), reviewDueOn: asDate(next.toISOString().slice(0, 10)), recordedById: user.userId, history: json([{ at: new Date().toISOString(), event: "CONSENT_RECORDED", visibility: input.visibility, mentoring: input.mentoring, by: user.userId }]) } });
}

/** The yearly review: consent and preferences confirmed again, or withdrawn. */
export async function reviewAlumni(user: AuthUser, id: string, raw: unknown) {
  await counsellor(user);
  const input = parse(z.object({ decision: z.enum(["CONFIRMED", "WITHDRAWN"]), visibility: z.enum(["STAFF_ONLY", "STUDENTS"]).optional(), mentoring: z.boolean().optional(), note: text(3, 300) }).strict(), raw);
  const profile = await prisma.alumniProfile.findFirst({ where: { id, schoolId: user.schoolId } });
  assert(!!profile, "Alumni profile not found", 404);
  if (input.decision === "WITHDRAWN") {
    await prisma.alumniProfile.update({ where: { id }, data: { consentWithdrawnAt: new Date(), visibility: "STAFF_ONLY", mentoring: false, history: push(profile.history, { event: "CONSENT_WITHDRAWN", note: input.note, by: user.userId }) } });
    const open = await prisma.mentoringRequest.findMany({ where: { schoolId: user.schoolId, alumniId: id, status: { in: ["REQUESTED", "CLARIFY", "APPROVED"] } } });
    for (const r of open) await prisma.mentoringRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", history: push(r.history, { event: "CANCELLED_CONSENT_WITHDRAWN", previous: r.status, by: user.userId }) } });
    return { withdrawn: id, cancelledRequests: open.length };
  }
  assert(!profile.consentWithdrawnAt, "Consent was withdrawn; record fresh consent instead.", 409);
  const next = new Date(); next.setUTCFullYear(next.getUTCFullYear() + 1);
  return prisma.alumniProfile.update({ where: { id }, data: { reviewDueOn: asDate(next.toISOString().slice(0, 10)), ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.mentoring !== undefined ? { mentoring: input.mentoring } : {}), history: push(profile.history, { event: "REVIEWED", note: input.note, by: user.userId }) } });
}

/** Alumni a student may discover: consented, mentoring, visible to students and within their review date. */
const discoverable = (campusId: string, schoolId: string): Prisma.AlumniProfileWhereInput => ({ schoolId, campusId, consentWithdrawnAt: null, visibility: "STUDENTS", mentoring: true, reviewDueOn: { gte: today() } });

export async function requestMentoring(user: AuthUser, raw: unknown) {
  const student = await ownStudent(user);
  const input = parse(z.object({ alumniId: text(1, 120), purpose: text(10, 600) }).strict(), raw);
  assert(!!(await prisma.alumniProfile.findFirst({ where: { id: input.alumniId, ...discoverable(student.campusId, user.schoolId) } })), "That alumnus is not available for mentoring.", 404);
  return prisma.mentoringRequest.create({ data: { schoolId: user.schoolId, campusId: student.campusId, reference: `MENT-${randomBytes(3).toString("hex").toUpperCase()}`, studentId: student.id, alumniId: input.alumniId, purpose: input.purpose, requestedById: user.userId, history: json([{ at: new Date().toISOString(), event: "REQUESTED", by: user.userId }]) } });
}

/** A counsellor decides. Approval revalidates consent, adulthood and review date, and needs the
 * school's safeguarding check and, for a minor or a student of unknown age, guardian consent. */
export async function decideMentoring(user: AuthUser, id: string, raw: unknown) {
  await counsellor(user);
  const input = parse(z.object({ decision: z.enum(["APPROVE", "CLARIFY", "DECLINE"]), note: text(3, 600), safeguardingChecked: z.boolean().default(false), guardianConsent: z.boolean().default(false) }).strict(), raw);
  const request = await prisma.mentoringRequest.findFirst({ where: { id, schoolId: user.schoolId, campusId: user.campusId ?? "" } });
  assert(!!request, "Request not found", 404);
  assert(["REQUESTED", "CLARIFY"].includes(request.status), "This request was already decided.", 409);
  if (input.decision === "APPROVE") {
    const [alumnus, student] = await Promise.all([prisma.alumniProfile.findFirst({ where: { id: request.alumniId, ...discoverable(request.campusId, user.schoolId) } }), prisma.student.findFirst({ where: { id: request.studentId }, select: { dateOfBirth: true } })]);
    assert(!!alumnus && (ageOn(alumnus.dateOfBirth) ?? 0) >= 18, "The alumnus's consent or review is no longer current. The request cannot be approved.", 409);
    assert(input.safeguardingChecked, "Confirm the school's safeguarding check before approving.", 409);
    const age = ageOn(student?.dateOfBirth);
    assert(age !== null && age >= 18 || input.guardianConsent, "This student is a minor or their age is not recorded; guardian consent is required.", 409);
  }
  const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "CLARIFY" ? "CLARIFY" : "DECLINED";
  return prisma.mentoringRequest.update({ where: { id }, data: { status, reviewedById: user.userId, reviewNote: input.note, safeguardingChecked: input.safeguardingChecked, guardianConsent: input.guardianConsent, decidedAt: new Date(), history: push(request.history, { event: status, note: input.note, by: user.userId }) } });
}

// ─── Overview ───────────────────────────────────────────────────

export async function pathwayOverview(user: AuthUser) {
  const now = new Date();
  const opportunities = async (campusId: string, includeWithdrawn: boolean) => (await prisma.pathwayOpportunity.findMany({ where: { schoolId: user.schoolId, campusId, ...(includeWithdrawn ? {} : { status: "ACTIVE" }) }, orderBy: [{ deadline: "asc" }, { createdAt: "desc" }], take: 100 })).map((o) => ({ ...o, state: opportunityState(o, now) }));
  if (user.role === "STUDENT") {
    const student = await ownStudent(user);
    const [plan, appointments, alumni, requests, counsellors, opps] = await Promise.all([
      planFor(student.id, "OWNER"),
      prisma.counsellingAppointment.findMany({ where: { studentId: student.id }, orderBy: { startsAt: "asc" } }),
      prisma.alumniProfile.findMany({ where: discoverable(student.campusId, user.schoolId), select: { id: true, displayName: true, pathway: true } }),
      prisma.mentoringRequest.findMany({ where: { studentId: student.id }, select: { id: true, reference: true, alumniId: true, purpose: true, status: true, reviewNote: true }, orderBy: { createdAt: "desc" } }),
      prisma.pathwayCounsellor.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, revokedAt: null }, select: { userId: true } }),
      opportunities(student.campusId, false),
    ]);
    const names = await prisma.user.findMany({ where: { id: { in: counsellors.map((c) => c.userId) } }, select: { id: true, fullName: true } });
    return { mode: "STUDENT" as const, studentId: student.id, plan, appointments, alumni, requests, counsellors: names, opportunities: opps };
  }
  if (user.role === "PARENT") {
    const links = await prisma.guardianRelationship.findMany({ where: { schoolId: user.schoolId, guardianUserId: user.userId, status: "ACTIVE" }, select: { studentId: true, student: { select: { fullName: true } } } });
    const children = [];
    for (const l of links) if (await guardianHasAccess({ schoolId: user.schoolId, studentId: l.studentId, guardianUserId: user.userId, permission: "learningRecords" })) children.push({ studentId: l.studentId, name: l.student.fullName, plan: await planFor(l.studentId, "GUARDIAN") });
    return { mode: "GUARDIAN" as const, children };
  }
  assert(STAFF.includes(user.role), "Pathways are not available for this account.");
  const campusId = campusOf(user);
  const designated = await isCounsellor(user);
  const [designations, staff, opps, sharedGoals] = await Promise.all([
    prisma.pathwayCounsellor.findMany({ where: { schoolId: user.schoolId, campusId, revokedAt: null } }),
    LEADERS.includes(user.role) ? prisma.user.findMany({ where: { schoolId: user.schoolId, campusId, isActive: true, role: { in: STAFF as never[] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : Promise.resolve([]),
    opportunities(campusId, true),
    designated ? prisma.pathwayGoal.findMany({ where: { schoolId: user.schoolId, campusId, audience: { has: "COUNSELLOR" }, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const counsellorNames = await prisma.user.findMany({ where: { id: { in: designations.map((d) => d.userId) } }, select: { id: true, fullName: true } });
  if (!designated) return { mode: "STAFF" as const, designated, isLeader: LEADERS.includes(user.role), designations: designations.map((d) => ({ ...d, name: counsellorNames.find((n) => n.id === d.userId)?.fullName ?? "" })), staff, opportunities: opps };
  const studentIds = [...new Set(sharedGoals.map((g) => g.studentId))];
  const [students, actions, appointments, alumni, requests] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true } }),
    prisma.pathwayAction.findMany({ where: { goalId: { in: sharedGoals.map((g) => g.id) } }, orderBy: { dueOn: "asc" } }),
    prisma.counsellingAppointment.findMany({ where: { schoolId: user.schoolId, counsellorId: user.userId, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" }, take: 50 }),
    prisma.alumniProfile.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" } }),
    prisma.mentoringRequest.findMany({ where: { schoolId: user.schoolId, campusId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const apptStudents = await prisma.student.findMany({ where: { id: { in: [...appointments.map((a) => a.studentId), ...requests.map((r) => r.studentId)] } }, select: { id: true, fullName: true, dateOfBirth: true } });
  return {
    mode: "COUNSELLOR" as const, designated, isLeader: LEADERS.includes(user.role),
    designations: designations.map((d) => ({ ...d, name: counsellorNames.find((n) => n.id === d.userId)?.fullName ?? "" })), staff, opportunities: opps,
    plans: studentIds.map((id) => ({ studentId: id, name: students.find((s) => s.id === id)?.fullName ?? "", goals: sharedGoals.filter((g) => g.studentId === id).map((g) => ({ ...g, actions: actions.filter((a) => a.goalId === g.id) })) })),
    appointments: appointments.map((a) => ({ ...a, studentName: apptStudents.find((s) => s.id === a.studentId)?.fullName ?? "" })),
    alumni: alumni.map((a) => ({ ...a, reviewOverdue: a.reviewDueOn < today() })),
    requests: requests.map((r) => { const s = apptStudents.find((x) => x.id === r.studentId); const age = ageOn(s?.dateOfBirth); return { ...r, studentName: s?.fullName ?? "", minor: age === null || age < 18 }; }),
  };
}
