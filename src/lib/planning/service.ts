import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, resolveCampusId } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { roomCapacity } from "@/lib/academic/room-capacity";
import { evaluate, type Assumptions, type BaselineData, type Result } from "./engine";

/**
 * SKO-453 capacity and staffing scenarios. Everything here reads live records and writes only
 * planning tables: a baseline snapshot, scenarios over it and reviewed handoffs. A handoff is a plan
 * with a named owner; approving it re-checks live resources and changes nothing operational.
 */

/** Campus planning (baselines, scenarios, handoffs) belongs to campus operations (M56); the academic lead keeps a
 *  read-only planner, so the principal reads the overview but never writes, proposes or owns a handoff. */
const PLANNERS = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"];
const READERS = [...PLANNERS, "PRINCIPAL"];
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const json = (value: unknown) => value as Prisma.InputJsonValue;

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiError(result.error.issues[0]?.message ?? "Invalid request", 400);
  return result.data;
}
function assert(cond: boolean, message: string, status = 403): asserts cond { if (!cond) throw new ApiError(message, status); }
async function scope(user: AuthUser, campusId?: string | null, roles: readonly string[] = PLANNERS) {
  assert(roles.includes(user.role), "Planning access is required; operational records remain unchanged.");
  return resolveCampusId(user, campusId);
}

/** Read the live campus into a baseline. Never writes. */
export async function snapshot(campusId: string) {
  const [classes, rooms, periods, slots, teachers] = await Promise.all([
    prisma.class.findMany({ where: { campusId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, capacity: true, _count: { select: { students: { where: { status: "active", archivedAt: null } } } } }, orderBy: [{ name: "asc" }, { section: "asc" }] }),
    prisma.classRoom.findMany({ where: { campusId, archivedAt: null }, select: { id: true, roomNumber: true, roomType: true, capacity: true, rows: true, benchesPerRow: true, seatsPerBench: true, examSeatsPerBench: true }, orderBy: { roomNumber: "asc" } }),
    prisma.periodDefinition.count({ where: { campusId, timeType: "CLASS" } }),
    prisma.timetableSlot.findMany({ where: { slotType: "CLASS", timetable: { campusId, class: { status: "ACTIVE", archivedAt: null } } }, select: { dayOfWeek: true, periodNumber: true, teacherId: true, subject: { select: { name: true } }, room: { select: { roomType: true } }, timetable: { select: { classId: true } } } }),
    prisma.user.findMany({ where: { campusId, isActive: true, role: "TEACHER" }, select: { id: true, fullName: true, staffProfile: { select: { contractedPeriodsPerWeek: true } } }, orderBy: { id: "asc" } }),
  ]);
  const missing: { code: string; detail: string }[] = [];
  const days = new Set(slots.map((s) => s.dayOfWeek));
  const teachingDays = days.size || 5;
  if (!days.size) missing.push({ code: "TEACHING_DAYS", detail: "No timetable lessons yet; 5 teaching days are assumed." });
  const periodsPerDay = periods || Math.max(0, ...slots.map((s) => s.periodNumber)) || 8;
  if (!periods) missing.push({ code: "PERIODS", detail: `No daily periods are defined; ${periodsPerDay} per day is assumed.` });

  const gradeOf = new Map(classes.map((c) => [c.id, c.name]));
  const grades = [...new Set(classes.map((c) => c.name))].map((grade) => ({ grade, sections: classes.filter((c) => c.name === grade).map((c) => ({ classId: c.id, label: c.section ? `${c.name} ${c.section}` : c.name, capacity: c.capacity ?? null, enrolled: c._count.students })) }));
  for (const c of classes) {
    if (!slots.some((s) => s.timetable.classId === c.id)) missing.push({ code: "NO_TIMETABLE", detail: `${c.section ? `${c.name} ${c.section}` : c.name} has no timetable; its subject periods are not counted.` });
  }

  // Subject demand: average periods per section across the grade's timetabled sections, and the room
  // type most of those periods use.
  const subjects: BaselineData["subjects"] = [];
  for (const g of grades) {
    const timetabled = g.sections.filter((s) => slots.some((x) => x.timetable.classId === s.classId));
    const names = [...new Set(slots.filter((s) => gradeOf.get(s.timetable.classId) === g.grade && s.subject).map((s) => s.subject!.name))];
    for (const subject of names) {
      const mine = slots.filter((s) => gradeOf.get(s.timetable.classId) === g.grade && s.subject?.name === subject);
      const types = new Map<string, number>();
      for (const s of mine) types.set(s.room?.roomType ?? "CLASSROOM", (types.get(s.room?.roomType ?? "CLASSROOM") ?? 0) + 1);
      const roomType = [...types].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      subjects.push({ grade: g.grade, subject, periodsPerSection: Math.round(mine.length / Math.max(1, timetabled.length)), roomType });
    }
  }
  const staff: BaselineData["teachers"] = teachers.map((t) => {
    const load = new Map<string, number>();
    for (const s of slots.filter((s) => s.teacherId === t.id && s.subject)) load.set(s.subject!.name, (load.get(s.subject!.name) ?? 0) + 1);
    return { userId: t.id, name: t.fullName, contracted: t.staffProfile?.contractedPeriodsPerWeek ?? null, load: [...load].map(([subject, periods]) => ({ subject, periods })).sort((a, b) => a.subject.localeCompare(b.subject)) };
  });
  const data: BaselineData = {
    teachingDays, periodsPerDay, grades, subjects, teachers: staff,
    rooms: rooms.map((r) => ({ id: r.id, roomNumber: r.roomNumber, type: r.roomType, seats: roomCapacity(r).teaching })),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return { data, missing, fingerprint };
}

export async function takeBaseline(user: AuthUser, raw: unknown) {
  const { campusId: requested } = parse(z.object({ campusId: z.string().max(120).optional() }).strict(), raw ?? {});
  const campusId = await scope(user, requested);
  const snap = await snapshot(campusId);
  return prisma.$transaction(async (tx) => {
    const last = await tx.planningBaseline.findFirst({ where: { campusId }, orderBy: { version: "desc" }, select: { version: true } });
    const baseline = await tx.planningBaseline.create({ data: { schoolId: user.schoolId, campusId, version: (last?.version ?? 0) + 1, fingerprint: snap.fingerprint, data: json(snap.data), missing: json(snap.missing), createdById: user.userId } });
    await writeAuditEvent(tx, user, { table: "planning_baselines", recordId: baseline.id, action: "CREATE", campusId, after: { version: baseline.version, missing: snap.missing.length } });
    return baseline;
  });
}

const Range = z.object({ low: z.number().min(0).max(1e10), high: z.number().min(0).max(1e10) }).strict().refine((r) => r.high >= r.low, "A cost range's high must be at least its low").nullable().optional();
const AssumptionsInput = z.object({
  classCap: z.number().int().min(1).max(200),
  intake: z.array(z.object({ grade: text(1, 80), students: z.number().int().min(-2000).max(2000) }).strict()).max(50).default([]),
  subjectNeeds: z.array(z.object({ grade: text(1, 80).nullable().optional(), subject: text(1, 80), periodsPerSection: z.number().int().min(0).max(60), roomType: z.enum(["CLASSROOM", "LAB", "HALL", "LIBRARY", "AUDITORIUM"]) }).strict()).max(50).default([]),
  addRooms: z.array(z.object({ type: z.enum(["CLASSROOM", "LAB", "HALL", "LIBRARY", "AUDITORIUM"]), count: z.number().int().min(1).max(50), seats: z.number().int().min(0).max(1000) }).strict()).max(20).default([]),
  teacherChanges: z.array(z.object({ userId: z.string().max(120).nullable().optional(), name: text(1, 120).nullable().optional(), subject: text(1, 80).nullable().optional(), periodsPerWeek: z.number().int().min(0).max(60) }).strict().refine((c) => !!c.userId || !!c.subject, "A new teacher needs a subject")).max(30).default([]),
  costs: z.object({ currency: z.string().regex(/^[A-Z]{3}$/u).nullable().optional(), teacherAnnual: Range, roomAnnual: Range }).strict().default({}),
}).strict();

const ScenarioInput = z.object({ baselineId: text(1, 120), name: text(2, 120), assumptions: AssumptionsInput }).strict();

/** Save a scenario: recompute its result from the baseline. Live records are never touched. */
export async function saveScenario(user: AuthUser, raw: unknown, id?: string, version?: number) {
  const input = parse(ScenarioInput, raw);
  const baseline = await prisma.planningBaseline.findFirst({ where: { id: input.baselineId } });
  assert(!!baseline, "Baseline not found", 404);
  const campusId = await scope(user, baseline.campusId);
  for (const c of input.assumptions.teacherChanges.filter((c) => c.userId)) assert((baseline.data as unknown as BaselineData).teachers.some((t) => t.userId === c.userId), "That teacher is not in this baseline.", 400);
  const result = evaluate(baseline.data as unknown as BaselineData, input.assumptions as Assumptions, baseline.missing as { code: string; detail: string }[]);
  if (!id) {
    return prisma.planningScenario.create({ data: { schoolId: user.schoolId, campusId, baselineId: baseline.id, name: input.name, assumptions: json(input.assumptions), result: json(result), createdById: user.userId } });
  }
  const done = await prisma.planningScenario.updateMany({ where: { id, campusId, baselineId: baseline.id, version: version ?? -1 }, data: { name: input.name, assumptions: json(input.assumptions), result: json(result), version: { increment: 1 } } });
  assert(done.count === 1, "This scenario changed since you opened it.", 409);
  return prisma.planningScenario.findUniqueOrThrow({ where: { id } });
}

export async function duplicateScenario(user: AuthUser, id: string) {
  const source = await prisma.planningScenario.findFirst({ where: { id } });
  assert(!!source, "Scenario not found", 404);
  await scope(user, source.campusId);
  return prisma.planningScenario.create({ data: { schoolId: user.schoolId, campusId: source.campusId, baselineId: source.baselineId, name: `${source.name} (copy)`.slice(0, 120), assumptions: json(source.assumptions), result: json(source.result), copiedFromId: source.id, createdById: user.userId } });
}

/** Refreshing is explicit: the scenario is copied onto the newest baseline and the original stays. */
export async function refreshScenario(user: AuthUser, id: string) {
  const source = await prisma.planningScenario.findFirst({ where: { id } });
  assert(!!source, "Scenario not found", 404);
  const campusId = await scope(user, source.campusId);
  const latest = await prisma.planningBaseline.findFirst({ where: { campusId }, orderBy: { version: "desc" } });
  assert(!!latest && latest.id !== source.baselineId, "Take a new baseline first; this scenario already uses the newest one.", 409);
  return saveScenario(user, { baselineId: latest.id, name: `${source.name} (refreshed v${latest.version})`.slice(0, 120), assumptions: source.assumptions });
}

/** Planning items from a scenario's result. Hard conflicts stay listed as unresolved. */
function planItems(result: Result) {
  const items: { kind: string; detail: string; estimate?: string }[] = [];
  for (const s of result.sections.filter((s) => s.added > 0)) items.push({ kind: "SECTION", detail: `Open ${s.added} more ${s.grade} section(s) for ${s.students} students` });
  if (result.metrics.roomsAdded) items.push({ kind: "ROOM", detail: `Provide ${result.metrics.roomsAdded} room(s) as assumed`, estimate: result.costs.rooms ? `${result.costs.rooms.low}–${result.costs.rooms.high} ${result.costs.currency ?? ""}`.trim() : "Cost unknown" });
  if (result.metrics.teachersAdded) items.push({ kind: "STAFF", detail: `Recruit ${result.metrics.teachersAdded} teacher(s) as assumed`, estimate: result.costs.teachers ? `${result.costs.teachers.low}–${result.costs.teachers.high} ${result.costs.currency ?? ""}`.trim() : "Cost unknown" });
  for (const f of result.findings.filter((f) => f.severity === "HARD")) items.push({ kind: "UNRESOLVED", detail: f.message });
  return items;
}

export async function proposeHandoff(user: AuthUser, scenarioId: string, raw: unknown) {
  const input = parse(z.object({ ownerId: text(1, 120), note: text(5, 1000) }).strict(), raw);
  const scenario = await prisma.planningScenario.findFirst({ where: { id: scenarioId } });
  assert(!!scenario, "Scenario not found", 404);
  const campusId = await scope(user, scenario.campusId);
  const owner = await prisma.user.findFirst({ where: { id: input.ownerId, campusId, isActive: true, role: { in: PLANNERS as never[] } }, select: { id: true } });
  assert(!!owner, "The owner must be a school leader on this campus.", 400);
  const handoff = await prisma.planningHandoff.create({ data: { schoolId: user.schoolId, campusId, scenarioId, scenarioVersion: scenario.version, ownerId: input.ownerId, note: input.note, items: json(planItems(scenario.result as unknown as Result)), proposedById: user.userId } });
  await writeAuditEvent(prisma, user, { table: "planning_handoffs", recordId: handoff.id, action: "CREATE", campusId, after: { scenarioId, ownerId: input.ownerId } });
  return handoff;
}

/**
 * Approve or reject a handoff. Approval needs someone other than the proposer, the scenario as it
 * was proposed, and live resources unchanged since the baseline; otherwise refresh and re-preview.
 */
export async function decideHandoff(user: AuthUser, id: string, raw: unknown) {
  const input = parse(z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: text(2, 500).optional() }).strict(), raw);
  const handoff = await prisma.planningHandoff.findFirst({ where: { id } });
  assert(!!handoff, "Plan not found", 404);
  const campusId = await scope(user, handoff.campusId);
  assert(handoff.status === "PROPOSED", "This plan was already decided.", 409);
  assert(handoff.proposedById !== user.userId, "Someone other than the proposer reviews this plan.");
  if (input.decision === "APPROVE") {
    const scenario = await prisma.planningScenario.findUniqueOrThrow({ where: { id: handoff.scenarioId } });
    assert(scenario.version === handoff.scenarioVersion, "The scenario changed after this plan was proposed. Propose it again.", 409);
    const baseline = await prisma.planningBaseline.findUniqueOrThrow({ where: { id: scenario.baselineId } });
    assert((await snapshot(campusId)).fingerprint === baseline.fingerprint, "Live rooms, classes or staffing changed since this scenario's baseline. Take a new baseline, refresh the scenario and re-preview before approving.", 409);
  }
  const done = await prisma.planningHandoff.updateMany({ where: { id, status: "PROPOSED" }, data: { status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedById: user.userId, decidedAt: new Date(), decisionNote: input.note ?? null } });
  assert(done.count === 1, "This plan was already decided.", 409);
  await writeAuditEvent(prisma, user, { table: "planning_handoffs", recordId: id, action: input.decision === "APPROVE" ? "APPROVE" : "REJECT", campusId, after: { status: input.decision } });
  return prisma.planningHandoff.findUniqueOrThrow({ where: { id } });
}

export async function planningOverview(user: AuthUser, campusId?: string | null) {
  const campus = await scope(user, campusId, READERS);
  const [baselines, scenarios, handoffs, leaders, live] = await Promise.all([
    prisma.planningBaseline.findMany({ where: { campusId: campus }, orderBy: { version: "desc" }, take: 10 }),
    prisma.planningScenario.findMany({ where: { campusId: campus }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.planningHandoff.findMany({ where: { campusId: campus }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.user.findMany({ where: { campusId: campus, isActive: true, role: { in: PLANNERS as never[] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    snapshot(campus),
  ]);
  return { userId: user.userId, baselines, latestIsCurrent: baselines[0]?.fingerprint === live.fingerprint, scenarios, handoffs, leaders };
}
