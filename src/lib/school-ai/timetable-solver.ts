import { z } from "zod";
import type { TimetableSetupProposal } from "./timetable-setup";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const timetableSolveInputSchema = z.strictObject({
  campusId: id,
  classId: id,
  term: z.enum(["ANNUAL", "TERM_1", "TERM_2", "TERM_3"]),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  roomIds: z.array(id).min(1).max(20),
  requirements: z.array(z.strictObject({ subjectId: id, periodsPerWeek: z.number().int().min(1).max(35), maxPerDay: z.number().int().min(1).max(10) })).min(1).max(30),
}).superRefine((value, ctx) => {
  for (const field of ["days", "roomIds"] as const) if (new Set<string | number>(value[field]).size !== value[field].length) ctx.addIssue({ code: "custom", path: [field], message: "Choose each option once." });
  if (new Set(value.requirements.map(item => item.subjectId)).size !== value.requirements.length) ctx.addIssue({ code: "custom", path: ["requirements"], message: "Choose each subject once." });
  if (value.requirements.reduce((sum, item) => sum + item.periodsPerWeek, 0) > 70) ctx.addIssue({ code: "custom", path: ["requirements"], message: "Plan at most 70 lessons at a time." });
});
export type TimetableSolveInput = z.infer<typeof timetableSolveInputSchema>;
export type SolverWindow = { dayOfWeek: number; periodNumber: number; startTime: string; endTime: string };
export type SolverBooking = SolverWindow & { teacherId: string | null; roomId: string | null; clockOnly?: boolean };
export type TimetableSolution = { status: "SOLVED"; slots: TimetableSetupProposal["slots"]; visited: number } | { status: "NO_SOLUTION" | "SEARCH_LIMIT"; slots: []; visited: number; subjectIds: string[] };

/** Deterministic bounded constraint search. A search limit is never proof of impossibility. */
export function solveTimetable(input: {
  requirements: Array<TimetableSolveInput["requirements"][number] & { teacherId: string }>;
  windows: SolverWindow[];
  roomIds: string[];
  bookings: SolverBooking[];
}, maxNodes = 20000): TimetableSolution {
  type Candidate = SolverWindow & { roomId: string; order: number };
  const overlap = (a: SolverWindow, b: SolverWindow) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;
  const sameCell = (a: SolverWindow, b: SolverWindow) => a.dayOfWeek === b.dayOfWeek && a.periodNumber === b.periodNumber;
  const windows = [...input.windows].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber);
  const deadline = performance.now() + 4000;
  const teacherBookings = new Map<string, SolverBooking[]>(), roomBookings = new Map<string, SolverBooking[]>();
  for (const booking of input.bookings) for (const [resourceId, map] of [[booking.teacherId, teacherBookings], [booking.roomId, roomBookings]] as const) { if (!resourceId) continue; const key = `${resourceId}:${booking.dayOfWeek}`; const values = map.get(key) ?? []; values.push(booking); map.set(key, values); }
  const clashes = (window: SolverWindow, bookings: SolverBooking[]) => bookings.some(booking => overlap(window, booking) || !booking.clockOnly && sameCell(window, booking));
  const subjects = input.requirements.map(requirement => ({
    ...requirement, remaining: requirement.periodsPerWeek, last: -1,
    candidates: windows.filter(window => !clashes(window, teacherBookings.get(`${requirement.teacherId}:${window.dayOfWeek}`) ?? [])).flatMap(window => input.roomIds.filter(roomId => !clashes(window, roomBookings.get(`${roomId}:${window.dayOfWeek}`) ?? [])).map(roomId => ({ ...window, roomId }))).map((candidate, order) => ({ ...candidate, order })),
  })).sort((a, b) => a.subjectId.localeCompare(b.subjectId));
  const selected: Array<Candidate & { subjectId: string; teacherId: string }> = [];
  let visited = 0, limited = false;
  const options = (subject: typeof subjects[number]) => subject.candidates.filter(candidate => candidate.order > subject.last &&
    !selected.some(slot => sameCell(slot, candidate) || overlap(slot, candidate)) &&
    selected.filter(slot => slot.subjectId === subject.subjectId && slot.dayOfWeek === candidate.dayOfWeek).length < subject.maxPerDay);
  function search(): boolean {
    if (subjects.every(subject => subject.remaining === 0)) return true;
    if (++visited > maxNodes || performance.now() > deadline) { limited = true; return false; }
    const choices = subjects.filter(subject => subject.remaining > 0).map(subject => ({ subject, candidates: options(subject) }));
    // Several rooms in a single cell still offer only one lesson for this class.
    if (choices.some(({ subject, candidates }) => new Set(candidates.map(slot => `${slot.dayOfWeek}:${slot.periodNumber}`)).size < subject.remaining)) return false;
    choices.sort((a, b) => a.candidates.length / a.subject.remaining - b.candidates.length / b.subject.remaining || a.subject.subjectId.localeCompare(b.subject.subjectId));
    const { subject, candidates } = choices[0];
    candidates.sort((a, b) => selected.filter(slot => slot.dayOfWeek === a.dayOfWeek && slot.subjectId === subject.subjectId).length - selected.filter(slot => slot.dayOfWeek === b.dayOfWeek && slot.subjectId === subject.subjectId).length || a.order - b.order);
    for (const candidate of candidates) {
      const previous = subject.last;
      subject.last = candidate.order; subject.remaining--;
      selected.push({ ...candidate, subjectId: subject.subjectId, teacherId: subject.teacherId });
      if (search()) return true;
      selected.pop(); subject.remaining++; subject.last = previous;
      if (limited) return false;
    }
    return false;
  }
  if (!search()) return { status: limited ? "SEARCH_LIMIT" : "NO_SOLUTION", slots: [], visited, subjectIds: subjects.map(subject => subject.subjectId) };
  return { status: "SOLVED", visited, slots: selected.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber).map((slot, index) => ({ id: `suggested-${index + 1}`, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, slotType: "CLASS" })) };
}
