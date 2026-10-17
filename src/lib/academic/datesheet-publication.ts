import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { validateStoredExamSchedules } from "@/lib/academic/exam-bookings";
import { examSeats } from "@/lib/academic/room-capacity";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { notify } from "@/lib/notifications/in-app";

/**
 * SKO-413: a session's datesheet and seating stay drafts until an officer
 * publishes a version. Publication re-runs every hard check against live
 * data — candidate, room and invigilator clashes, seats for every current
 * candidate, usable exam capacity, an invigilator per room — and refuses on
 * any failure. Families read only the published snapshot, so later edits are
 * invisible until a new version is published with a reason, its diff and the
 * exact people it affects (told once).
 */

export type Room = { roomId: string; roomNumber: string; invigilatorId: string | null; invigilatorName: string | null; seats: number; capacity: number };
export type Paper = {
  scheduleId: string; examId: string; examTitle: string; classId: string; classLabel: string; subjectId: string; subjectName: string; totalMarks: number;
  date: string; startTime: string | null; endTime: string | null; rooms: Room[]; candidates: number; seated: number;
};
export type Issue = { scheduleId: string | null; paper: string; kind: string; message: string };
type Snapshot = { papers: Paper[] };
type Change = { scheduleId: string; paper: string; kind: "ADDED" | "REMOVED" | "MOVED" | "ROOMS_CHANGED" | "INVIGILATORS_CHANGED"; before?: string; after?: string };

const label = (c: { name: string; section: string | null }) => [c.name, c.section].filter(Boolean).join(" ");
const paperName = (p: Pick<Paper, "classLabel" | "subjectName">) => `${p.classLabel} — ${p.subjectName}`;
const when = (p: Pick<Paper, "date" | "startTime" | "endTime">) => `${p.date} ${p.startTime ?? "?"}–${p.endTime ?? "?"}`;

export function assertExamOffice(user: AuthUser) {
  // Formal sessions belong to the office; a teacher's class-test rights never reach here.
  if (!canManageOperations(user)) throw new ApiError("Only the examination office can publish a datesheet", 403);
}

async function loadSession(user: AuthUser, sessionId: string) {
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? undefined }) }, select: { id: true, campusId: true, schoolId: true, title: true } });
  if (!session) throw new ApiError("Exam session not found", 404);
  return session;
}

/** Live state of every paper in the session, plus the seat map used to detect seating drift. */
async function liveState(sessionId: string, campusId: string) {
  const schedules = await prisma.examSchedule.findMany({
    where: { campusId, exam: { sessionId, status: { notIn: ["CANCELLED", "ARCHIVED"] } } },
    include: {
      subject: { select: { id: true, name: true, totalMarks: true } },
      periodDefinition: { select: { startTime: true, endTime: true } },
      exam: { select: { id: true, title: true, classId: true, class: { select: { name: true, section: true } } } },
      rooms: { orderBy: { createdAt: "asc" }, include: { room: true, invigilation: { include: { teacher: { select: { id: true, fullName: true } } } }, _count: { select: { seats: true } } } },
      seats: { select: { studentId: true, examRoomId: true, seatNumber: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const classIds = [...new Set(schedules.map(s => s.exam.classId))];
  const roster = await prisma.student.findMany({ where: { classId: { in: classIds }, status: "active", archivedAt: null }, select: { id: true, classId: true } });
  const byClass = new Map<string, Set<string>>();
  for (const pupil of roster) byClass.set(pupil.classId, (byClass.get(pupil.classId) ?? new Set()).add(pupil.id));
  const papers: Paper[] = schedules.map(s => {
    const candidates = byClass.get(s.exam.classId) ?? new Set<string>();
    return {
      scheduleId: s.id, examId: s.exam.id, examTitle: s.exam.title, classId: s.exam.classId, classLabel: label(s.exam.class), subjectId: s.subject.id, subjectName: s.subject.name, totalMarks: s.subject.totalMarks,
      date: s.date.toISOString().slice(0, 10), startTime: s.periodDefinition?.startTime ?? null, endTime: s.periodDefinition?.endTime ?? null,
      rooms: s.rooms.map(r => ({ roomId: r.roomId, roomNumber: r.room.roomNumber, invigilatorId: r.invigilation?.teacherId ?? null, invigilatorName: r.invigilation?.teacher.fullName ?? null, seats: r._count.seats, capacity: examSeats(r.room) })),
      candidates: candidates.size, seated: s.seats.filter(seat => candidates.has(seat.studentId)).length,
    };
  });
  const seatMap = schedules.flatMap(s => s.seats.map(seat => `${s.id}:${seat.studentId}:${seat.examRoomId}:${seat.seatNumber}`)).sort();
  return { schedules, papers, byClass, seatingHash: createHash("sha256").update(seatMap.join("|")).digest("hex").slice(0, 16) };
}

/** Every hard problem that blocks publication, each tied to its paper. */
async function hardIssues(user: AuthUser, campusId: string, live: Awaited<ReturnType<typeof liveState>>) {
  const issues: Issue[] = [];
  if (!live.papers.length) issues.push({ scheduleId: null, paper: "", kind: "EMPTY", message: "No papers are placed in this session yet." });
  for (const schedule of live.schedules) {
    const paper = live.papers.find(p => p.scheduleId === schedule.id)!;
    const name = paperName(paper);
    if (!paper.startTime || !paper.endTime) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "NO_TIME", message: "This paper has no exam period (start and end time)." });
    if (!paper.rooms.length) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "NO_ROOM", message: "This paper has no room." });
    for (const room of paper.rooms) {
      if (!room.invigilatorId) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "NO_INVIGILATOR", message: `Room ${room.roomNumber} has no invigilator.` });
      if (room.seats > room.capacity) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "OVER_CAPACITY", message: `Room ${room.roomNumber} seats ${room.seats} but its usable exam capacity is ${room.capacity}.` });
    }
    const roster = live.byClass.get(paper.classId) ?? new Set<string>();
    const seated = new Set(schedule.seats.map(seat => seat.studentId));
    const unseated = [...roster].filter(id => !seated.has(id)).length;
    const stale = [...seated].filter(id => !roster.has(id)).length;
    if (paper.rooms.length && unseated) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "UNSEATED", message: `${unseated} current candidate(s) have no seat.` });
    if (stale) issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "STALE_SEATS", message: `${stale} seat(s) belong to pupils no longer in this class.` });
    // Candidate, room and invigilator clashes, lessons, leave and holidays — the same rules every write uses.
    try { await validateStoredExamSchedules(prisma, { schoolId: user.schoolId, campusId }, [schedule.id]); }
    catch (error) { issues.push({ scheduleId: paper.scheduleId, paper: name, kind: "CLASH", message: error instanceof Error ? error.message : "This paper clashes with another commitment." }); }
  }
  return issues;
}

function diff(before: Paper[], after: Paper[]): Change[] {
  const changes: Change[] = [];
  const old = new Map(before.map(p => [p.scheduleId, p]));
  const next = new Map(after.map(p => [p.scheduleId, p]));
  for (const p of after) {
    const prior = old.get(p.scheduleId);
    if (!prior) { changes.push({ scheduleId: p.scheduleId, paper: paperName(p), kind: "ADDED", after: when(p) }); continue; }
    if (when(prior) !== when(p)) changes.push({ scheduleId: p.scheduleId, paper: paperName(p), kind: "MOVED", before: when(prior), after: when(p) });
    const rooms = (x: Paper) => x.rooms.map(r => r.roomNumber).sort().join(", ");
    if (rooms(prior) !== rooms(p)) changes.push({ scheduleId: p.scheduleId, paper: paperName(p), kind: "ROOMS_CHANGED", before: rooms(prior), after: rooms(p) });
    const staff = (x: Paper) => x.rooms.map(r => r.invigilatorName ?? "—").sort().join(", ");
    if (staff(prior) !== staff(p)) changes.push({ scheduleId: p.scheduleId, paper: paperName(p), kind: "INVIGILATORS_CHANGED", before: staff(prior), after: staff(p) });
  }
  for (const p of before) if (!next.has(p.scheduleId)) changes.push({ scheduleId: p.scheduleId, paper: paperName(p), kind: "REMOVED", before: when(p) });
  return changes;
}

async function latestVersion(sessionId: string) {
  return prisma.examDatesheetVersion.findFirst({ where: { sessionId }, orderBy: { version: "desc" } });
}

/** What an officer sees before publishing: live checks, pending changes against the last version, history. */
export async function publicationStatus(user: AuthUser, sessionId: string) {
  assertExamOffice(user);
  const session = await loadSession(user, sessionId);
  const live = await liveState(sessionId, session.campusId);
  const [issues, latest, history] = await Promise.all([
    hardIssues(user, session.campusId, live),
    latestVersion(sessionId),
    prisma.examDatesheetVersion.findMany({ where: { sessionId }, orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, reason: true, publishedAt: true, publishedById: true, changes: true, affected: true } }),
  ]);
  const changes = latest ? diff((latest.snapshot as Snapshot).papers, live.papers) : [];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: history.map(h => h.publishedById) } }, select: { id: true, fullName: true } })).map(u => [u.id, u.fullName]));
  return {
    session: { id: session.id, title: session.title },
    papers: live.papers, issues, blocked: issues.length > 0,
    latest: latest ? { id: latest.id, version: latest.version, publishedAt: latest.publishedAt } : null,
    pendingChanges: changes, seatingChanged: Boolean(latest && latest.seatingHash !== live.seatingHash),
    history: history.map(h => ({ id: h.id, version: h.version, reason: h.reason, publishedAt: h.publishedAt, publishedBy: names.get(h.publishedById) ?? "", changeCount: Array.isArray(h.changes) ? (h.changes as unknown[]).length : 0, affected: h.affected })),
  };
}

export async function publishDatesheet(user: AuthUser, sessionId: string, expectedVersion: number, reason?: string | null) {
  assertExamOffice(user);
  const session = await loadSession(user, sessionId);
  const live = await liveState(sessionId, session.campusId);
  const issues = await hardIssues(user, session.campusId, live);
  if (issues.length) throw Object.assign(new ApiError(`Publication is blocked by ${issues.length} problem(s). Resolve them and publish again.`, 409), { issues });
  const latest = await latestVersion(sessionId);
  if ((latest?.version ?? 0) !== expectedVersion) throw new ApiError("Another version was published while you were reviewing. Reload and review the changes again.", 409);
  const changes = latest ? diff((latest.snapshot as Snapshot).papers, live.papers) : [];
  const seatingChanged = Boolean(latest && latest.seatingHash !== live.seatingHash);
  const why = reason?.trim() || null;
  if (latest && !changes.length && !seatingChanged) throw new ApiError(`Nothing has changed since version ${latest.version}.`, 409);
  if (latest && (!why || why.length < 8)) throw new ApiError("Explain what changed and why; families and staff see a changed datesheet.", 400);

  // Who must hear about it: everyone on a first publication; afterwards only
  // the classes whose papers moved, were added/removed or changed room, and
  // the invigilators on any changed paper (before and after).
  const priorPapers = latest ? (latest.snapshot as Snapshot).papers : [];
  const touched = latest ? new Set(changes.map(c => c.scheduleId)) : new Set(live.papers.map(p => p.scheduleId));
  const familyTouched = latest ? new Set(changes.filter(c => c.kind !== "INVIGILATORS_CHANGED").map(c => c.scheduleId)) : touched;
  const all = [...live.papers, ...priorPapers];
  const classIds = [...new Set(all.filter(p => familyTouched.has(p.scheduleId)).map(p => p.classId))];
  const staffIds = [...new Set(all.filter(p => touched.has(p.scheduleId)).flatMap(p => p.rooms.map(r => r.invigilatorId)).filter((id): id is string => Boolean(id)))];
  const students = classIds.length ? await prisma.student.findMany({ where: { classId: { in: classIds }, status: "active", archivedAt: null }, select: { id: true, studentUserId: true } }) : [];
  const guardians = students.length ? await prisma.guardianRelationship.findMany({ where: { studentId: { in: students.map(s => s.id) }, ...liveGuardianRelationshipWhere(null, "learningRecords", new Date(), user.schoolId) }, select: { guardianUserId: true } }) : [];
  const affected = { classes: classIds.length, students: students.length, staff: staffIds.length };

  const created = await prisma.$transaction(async tx => {
    const row = await tx.examDatesheetVersion.create({ data: {
      schoolId: user.schoolId, campusId: session.campusId, sessionId, version: (latest?.version ?? 0) + 1,
      snapshot: { papers: live.papers }, seatingHash: live.seatingHash, changes: latest ? changes : undefined, affected, reason: why, publishedById: user.userId,
    } }).catch((error: { code?: string }) => { if (error.code === "P2002") throw new ApiError("Another version was published at the same time. Reload and review again.", 409); throw error; });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "exam_datesheet_versions", recordId: row.id,
      oldValue: latest ? { version: latest.version } : undefined, newValue: { version: row.version, sessionId, changes: changes.length, seatingChanged, reason: why, affected } } });
    return row;
  });

  // Told once per version: the notification is keyed to this version's id.
  const recipientIds = [...new Set([...staffIds, ...students.map(s => s.studentUserId), ...guardians.map(g => g.guardianUserId)].filter((id): id is string => Boolean(id)))];
  if (recipientIds.length) notify("EXAM_DATESHEET_PUBLISHED", { schoolId: user.schoolId, campusId: session.campusId, actorId: user.userId, actorName: user.fullName, recipientIds,
    versionId: created.id, version: created.version, sessionTitle: session.title, changeCount: changes.length, first: !latest });
  return { id: created.id, version: created.version, changes, seatingChanged, affected, recipients: recipientIds.length };
}

/**
 * Family read model: published papers for the given classes, taken from each
 * session's latest version — never the live draft.
 */
export async function publishedPapersForClasses(schoolId: string, classIds: string[]) {
  if (!classIds.length) return [];
  const sessionIds = [...new Set((await prisma.exam.findMany({ where: { schoolId, classId: { in: classIds }, sessionId: { not: null } }, select: { sessionId: true } })).map(e => e.sessionId!))];
  if (!sessionIds.length) return [];
  const versions = await prisma.examDatesheetVersion.findMany({ where: { schoolId, sessionId: { in: sessionIds } }, orderBy: { version: "desc" }, select: { id: true, sessionId: true, version: true, publishedAt: true, snapshot: true } });
  const latest = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if (!latest.has(v.sessionId)) latest.set(v.sessionId, v);
  return [...latest.values()].flatMap(v => (v.snapshot as Snapshot).papers.filter(p => classIds.includes(p.classId)).map(p => ({ ...p, sessionId: v.sessionId, versionId: v.id, version: v.version, publishedAt: v.publishedAt })));
}

/** Label printed on documents so paper and portal identify the same version. */
export async function documentVersionLabel(sessionId: string | undefined, campusId: string, kind: "datesheet" | "seating") {
  if (!sessionId) return "Not part of a published session";
  const latest = await latestVersion(sessionId);
  if (!latest) return "DRAFT — not published";
  const base = `Version ${latest.version} · ref ${latest.id.slice(0, 8)} · published ${latest.publishedAt.toISOString().slice(0, 10)}`;
  const live = await liveState(sessionId, campusId);
  const drifted = kind === "seating" ? live.seatingHash !== latest.seatingHash : diff((latest.snapshot as Snapshot).papers, live.papers).length > 0;
  return drifted ? `DRAFT — changed since ${base}` : base;
}

export async function latestPublishedVersion(sessionId: string) {
  return latestVersion(sessionId);
}
