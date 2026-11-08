import { z } from "zod";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timetableSlotTypes = ["CLASS", "BREAK", "ASSEMBLY", "PRAYER", "ACTIVITY"] as const;
export const timetableSetupProposalSchema = z.strictObject({
  operation: z.literal("timetable.create_draft"),
  classId: id,
  academicYear: z.number().int().min(2000).max(2100),
  term: z.enum(["ANNUAL", "TERM_1", "TERM_2", "TERM_3"]),
  slots: z.array(z.strictObject({
    id, dayOfWeek: z.number().int().min(1).max(7), periodNumber: z.number().int().min(1).max(30),
    startTime: time, endTime: time, slotType: z.enum(timetableSlotTypes),
    subjectId: id.nullable(), teacherId: id.nullable(), roomId: id.nullable(),
  })).min(1).max(140),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  const ids = new Set<string>();
  const periodWindows = new Map<number, { startTime: string; endTime: string }>();
  for (const [index, slot] of value.slots.entries()) {
    const issue = (message: string) => context.addIssue({ code: "custom", path: ["slots", index], message });
    if (slot.startTime >= slot.endTime) issue("The end time must follow the start time.");
    if (ids.has(slot.id) || seen.has(`${slot.dayOfWeek}:${slot.periodNumber}`)) issue("Each slot ID and day/period must be unique.");
    ids.add(slot.id); seen.add(`${slot.dayOfWeek}:${slot.periodNumber}`);
    const priorWindow = periodWindows.get(slot.periodNumber);
    if (priorWindow && (priorWindow.startTime !== slot.startTime || priorWindow.endTime !== slot.endTime)) {
      for (const field of ["startTime", "endTime"]) context.addIssue({ code: "custom", path: ["slots", index, field], message: "Use the same start and end times for this period number on every day.", params: { code: "TIMETABLE_PERIOD_INCONSISTENT" } });
    }
    periodWindows.set(slot.periodNumber, slot);
    if (slot.slotType === "CLASS" && (!slot.subjectId || !slot.teacherId || !slot.roomId)) issue("A teaching slot needs a subject, its assigned teacher and a room.");
    if (slot.slotType !== "CLASS" && (slot.subjectId || slot.teacherId || slot.roomId)) issue("Non-teaching slots cannot reserve a subject, teacher or room.");
    if (value.slots.slice(0, index).some(other => other.dayOfWeek === slot.dayOfWeek && other.startTime < slot.endTime && slot.startTime < other.endTime)) issue("Class periods cannot overlap in time.");
  }
  if (!value.slots.some(slot => slot.slotType === "CLASS")) context.addIssue({ code: "custom", path: ["slots"], message: "Add at least one teaching slot." });
});
export type TimetableSetupProposal = z.infer<typeof timetableSetupProposalSchema>;
export interface TimetableSetupOptions {
  campusId: string;
  weekendDays: number[];
  classes: Array<{ id: string; name: string; section: string | null; academicYear: number; teachingMode: string; classTeacherId: string | null }>;
  subjects: Array<{ id: string; name: string; classId: string; teacherId: string | null }>;
  teachers: Array<{ id: string; fullName: string }>;
  rooms: Array<{ id: string; roomNumber: string; capacity: number }>;
  periods: Array<{ periodNumber: number; startTime: string; endTime: string }>;
}
export interface TimetableSetupPreview {
  operation: "timetable.create_draft";
  recordId: string; version: number; campusId: string; classId: string; className: string; academicYear: number; term: TimetableSetupProposal["term"];
  slots: Array<TimetableSetupProposal["slots"][number] & { subjectName: string | null; teacherName: string | null; roomNumber: string | null }>;
  warnings: Array<{ code: "ROOM_CAPACITY" | "ROOM_CAPACITY_UNKNOWN"; dayOfWeek: number; periodNumber: number; roomNumber: string; capacity: number; classSize: number }>;
  previewHash: string;
}
export interface TimetableSetupExecutionReceipt {
  id: string; operation: "timetable.create_draft"; recordId: string; version: number; status: "COMPLETED";
  timetableId: string; timetableStatus: "DRAFT"; slotCount: number; classId: string; academicYear: number; term: string; completedAt: string;
}
