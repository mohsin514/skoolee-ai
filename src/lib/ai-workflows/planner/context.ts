import { prisma } from "@/lib/db/prisma";
import type { CapabilityContext } from "../registry/types";
import { assignedClassWhere, assignedSubjectWhere } from "../resolve/scope";

/**
 * The model never sees or writes a record id. It sees the actor's own records under short handles
 * ("class:1", "room:3") and writes handles; the server swaps them for ids scoped to this actor.
 * A handle that is not in the map, or an id-looking value the model invented, becomes a question.
 */
export type HandleKind = "class" | "subject" | "room" | "period" | "cycle" | "teacher" | "holiday";
export interface PlannerContext {
  /** What the model reads: labels by handle (class, subject and room labels stay clear; teachers are masked). */
  visible: Record<HandleKind, Array<{ handle: string; label: string; facts?: Record<string, string | number | null> }>>;
  /** Server-only: handle → id. */
  ids: Map<string, string>;
}

const LIMIT = 200;

export async function buildPlannerContext(ctx: CapabilityContext): Promise<PlannerContext> {
  const visible: PlannerContext["visible"] = { class: [], subject: [], room: [], period: [], cycle: [], teacher: [], holiday: [] };
  const ids = new Map<string, string>();
  const add = (kind: HandleKind, id: string, label: string, facts?: Record<string, string | number | null>) => {
    const handle = `${kind}:${visible[kind].length + 1}`;
    visible[kind].push({ handle, label, ...(facts ? { facts } : {}) });
    ids.set(handle, id);
  };
  if (!ctx.campusId || ctx.user.role === "APP_OWNER" || ctx.user.role === "STUDENT" || ctx.user.role === "PARENT") return { visible, ids };
  const scope = { schoolId: ctx.user.schoolId, campusId: ctx.campusId };
  const [classes, subjects, rooms, periods, cycles, teachers, holidays] = await Promise.all([
    // A teacher's handles cover only their own classes and subjects, so a foreign class cannot even be named.
    prisma.class.findMany({ where: { ...scope, archivedAt: null, status: "ACTIVE", ...assignedClassWhere(ctx.user) }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ name: "asc" }, { section: "asc" }], take: LIMIT }),
    prisma.subject.findMany({ where: { class: { ...scope, archivedAt: null }, ...assignedSubjectWhere(ctx.user) }, select: { id: true, name: true, class: { select: { name: true, section: true } } }, take: LIMIT }),
    prisma.classRoom.findMany({ where: scope, select: { id: true, roomNumber: true, roomType: true }, take: LIMIT }),
    prisma.periodDefinition.findMany({ where: scope, select: { id: true, periodNumber: true, timeType: true, startTime: true, endTime: true }, orderBy: { periodNumber: "asc" }, take: 100 }),
    prisma.academicCycle.findMany({ where: scope, select: { id: true, academicYear: true, label: true, status: true }, take: 20 }),
    prisma.user.findMany({ where: { ...scope, role: "TEACHER", isActive: true }, select: { id: true }, take: LIMIT }),
    prisma.holiday.findMany({ where: scope, select: { id: true, name: true, fromDate: true, toDate: true }, take: LIMIT }),
  ]);
  for (const row of classes) add("class", row.id, [row.name, row.section].filter(Boolean).join(" "), { academicYear: row.academicYear });
  for (const row of subjects) add("subject", row.id, `${row.name} (${[row.class.name, row.class.section].filter(Boolean).join(" ")})`);
  for (const row of rooms) add("room", row.id, row.roomNumber, { type: row.roomType });
  for (const row of periods) add("period", row.id, `${row.timeType} ${row.periodNumber}`, { start: row.startTime, end: row.endTime });
  for (const row of cycles) add("cycle", row.id, row.label, { academicYear: row.academicYear, status: row.status });
  // Teachers are people: the model gets a numbered handle, never a name.
  for (const row of teachers) add("teacher", row.id, `Teacher ${visible.teacher.length + 1}`);
  for (const row of holidays) add("holiday", row.id, row.name, { from: row.fromDate.toISOString().slice(0, 10), to: row.toDate.toISOString().slice(0, 10) });
  return { visible, ids };
}

const HANDLE = /^(class|subject|room|period|cycle|teacher|holiday):\d{1,4}$/;
const ID_KEY = /(Id|Ids)$/;

/** Replaces handles with ids. Unknown handles and invented ids are reported as missing pointers. */
export function bindHandles(value: unknown, ids: ReadonlyMap<string, string>): { value: unknown; missing: string[] } {
  const missing: string[] = [];
  const walk = (item: unknown, pointer: string, idField: boolean): unknown => {
    if (typeof item === "string") {
      if (HANDLE.test(item)) { const id = ids.get(item); if (!id) missing.push(pointer); return id ?? item; }
      if (idField) { missing.push(pointer); return item; }
      return item;
    }
    if (Array.isArray(item)) return item.map((child, index) => walk(child, `${pointer}/${index}`, idField));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, walk(child, `${pointer}/${key}`, ID_KEY.test(key))]));
    return item;
  };
  return { value: walk(value, "", false), missing };
}
