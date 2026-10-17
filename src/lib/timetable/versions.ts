import type { Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { schoolToday } from "@/lib/datetime";

// SKO-403: published timetable versions. The slot rows of a timetable are its working draft; a publication
// freezes them into a numbered version with an effective date. Every family, student and teacher view
// reads the version in force — the highest version whose effective date has arrived — so draft edits and
// future publications never change what people see before their date.

export type SnapshotSlot = {
  id: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; slotType: string;
  subjectId: string | null; subjectName: string | null; teacherId: string | null; teacherName: string | null; roomId: string | null; roomNumber: string | null;
};
export type SlotChange = { slotId: string; dayOfWeek: number; periodNumber: number; before: SnapshotSlot | null; after: SnapshotSlot | null };
type DraftSlot = { id: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; slotType: string; subjectId: string | null; teacherId: string | null; roomId: string | null; roomNumber: string | null; subject?: { name: string } | null; teacher?: { fullName: string } | null; room?: { roomNumber: string } | null };

export function snapshotSlots(slots: DraftSlot[]): SnapshotSlot[] {
  return [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber).map(slot => ({
    id: slot.id, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, slotType: slot.slotType,
    subjectId: slot.subjectId, subjectName: slot.subject?.name ?? null, teacherId: slot.teacherId, teacherName: slot.teacher?.fullName ?? null,
    roomId: slot.roomId, roomNumber: slot.room?.roomNumber ?? slot.roomNumber ?? null,
  }));
}

const KEYS = ["dayOfWeek", "periodNumber", "startTime", "endTime", "slotType", "subjectId", "teacherId", "roomId"] as const;
/** Lessons added, removed or changed between two snapshots (by slot identity). */
export function diffSnapshots(before: SnapshotSlot[] | null, after: SnapshotSlot[]): SlotChange[] {
  const previous = new Map((before ?? []).map(slot => [slot.id, slot])), next = new Map(after.map(slot => [slot.id, slot]));
  const teaching = (slot?: SnapshotSlot | null) => Boolean(slot && (slot.subjectId || slot.teacherId || slot.roomId || slot.slotType !== "CLASS"));
  const changes: SlotChange[] = [];
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(id) ?? null, b = next.get(id) ?? null;
    if (!teaching(a) && !teaching(b)) continue;
    if (a && b && KEYS.every(key => a[key] === b[key])) continue;
    const ref = (b ?? a)!;
    changes.push({ slotId: id, dayOfWeek: ref.dayOfWeek, periodNumber: ref.periodNumber, before: a, after: b });
  }
  return changes.sort((x, y) => x.dayOfWeek - y.dayOfWeek || x.periodNumber - y.periodNumber);
}

export const affectedTeacherIds = (changes: SlotChange[]) => [...new Set(changes.flatMap(change => [change.before?.teacherId, change.after?.teacherId]).filter((id): id is string => Boolean(id)))];

type VersionRow = { id: string; version: number; effectiveFrom: Date; slots: Prisma.JsonValue; draftRevision: number; publishedAt: Date };
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** The version people see on `today` (YYYY-MM-DD, school-local), and the next one scheduled after it. */
export async function versionsFor(timetableId: string, today: string, db: Pick<TxClient, "timetableVersion"> = prisma) {
  const rows: VersionRow[] = await db.timetableVersion.findMany({ where: { timetableId }, orderBy: { version: "desc" }, select: { id: true, version: true, effectiveFrom: true, slots: true, draftRevision: true, publishedAt: true } });
  const inForce = rows.find(row => row.effectiveFrom <= day(today)) ?? null;
  const upcoming = rows.find(row => row.effectiveFrom > day(today) && (!inForce || row.version > inForce.version)) ?? null;
  return { inForce, upcoming, latest: rows[0] ?? null };
}

export const slotsOf = (version: Pick<VersionRow, "slots"> | null) => (version?.slots ?? []) as unknown as SnapshotSlot[];
export const versionSummary = (version: Pick<VersionRow, "version" | "effectiveFrom"> | null) => version ? { version: version.version, effectiveFrom: version.effectiveFrom.toISOString().slice(0, 10) } : null;

/** Freeze the current draft as the next version. The caller holds the campus timetable lock. */
export async function recordTimetableVersion(tx: TxClient, input: { schoolId: string; campusId: string; timetableId: string; effectiveFrom: string; publishedById: string; note?: string | null }) {
  const board = await tx.timetable.findFirstOrThrow({ where: { id: input.timetableId, schoolId: input.schoolId, campusId: input.campusId }, select: { draftRevision: true, slots: { include: { subject: { select: { name: true } }, teacher: { select: { fullName: true } }, room: { select: { roomNumber: true } } } } } });
  const latest = await tx.timetableVersion.findFirst({ where: { timetableId: input.timetableId }, orderBy: { version: "desc" } });
  const slots = snapshotSlots(board.slots), changes = diffSnapshots(latest ? slotsOf(latest) : null, slots);
  const version = await tx.timetableVersion.create({ data: { schoolId: input.schoolId, campusId: input.campusId, timetableId: input.timetableId, version: (latest?.version ?? 0) + 1, draftRevision: board.draftRevision, effectiveFrom: day(input.effectiveFrom), slots: slots as unknown as Prisma.InputJsonValue, changes: changes as unknown as Prisma.InputJsonValue, note: input.note ?? null, publishedById: input.publishedById } });
  return { version, changes, previous: latest };
}

/** The class's published timetable as people see it today: the version in force, and any scheduled change. */
export async function publishedClassTimetable(classId: string) {
  const timetable = await prisma.timetable.findFirst({ where: { classId, status: "PUBLISHED" }, orderBy: { academicYear: "desc" }, select: { id: true, schoolId: true, campusId: true, classId: true, class: { select: { name: true, section: true, campusId: true } } } });
  if (!timetable) return null;
  const today = await schoolToday(timetable.schoolId, timetable.campusId);
  const { inForce, upcoming } = await versionsFor(timetable.id, today);
  if (!inForce) return { timetable, version: null, upcoming: versionSummary(upcoming), slots: [] as SnapshotSlot[] };
  return { timetable, version: versionSummary(inForce), upcoming: versionSummary(upcoming), slots: slotsOf(inForce) };
}
