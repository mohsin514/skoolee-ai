import type { SolverBooking, SolverWindow } from "./timetable-solver";
import type { TimetableSetupProposal } from "./timetable-setup";

export type SchoolSolverClass = { classId: string; academicYear: number; requirements: Array<{ subjectId: string; teacherId: string; periodsPerWeek: number; maxPerDay: number }>; windows: SolverWindow[]; roomIds: string[]; bookings: SolverBooking[] };
type Slot = SolverWindow & { roomId: string; teacherId: string; subjectId: string; classId: string; order: number };
export type SchoolTimetableSolution = { status: "SOLVED"; timetables: TimetableSetupProposal[]; visited: number } | { status: "NO_SOLUTION" | "SEARCH_LIMIT"; timetables: []; visited: number };

/** Search every selected class together; backtracking can move an earlier class to free shared staff. */
export function solveSchoolTimetable(classes: SchoolSolverClass[], term: TimetableSetupProposal["term"], maxNodes = 80000): SchoolTimetableSolution {
  const overlap = (a: SolverWindow, b: SolverWindow) => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime;
  const sameCell = (a: SolverWindow, b: SolverWindow) => a.dayOfWeek === b.dayOfWeek && a.periodNumber === b.periodNumber;
  const complexity = classes.reduce((sum, cls) => sum + cls.requirements.length * cls.windows.length * cls.roomIds.length, 0);
  if (complexity > 250000) return { status: "SEARCH_LIMIT", visited: 0, timetables: [] };
  const deadline = performance.now() + 4000;
  const tasks = classes.flatMap(cls => {
    const teacherBookings = new Map<string, SolverBooking[]>(), roomBookings = new Map<string, SolverBooking[]>();
    for (const booking of cls.bookings) for (const [resourceId, map] of [[booking.teacherId, teacherBookings], [booking.roomId, roomBookings]] as const) { if (!resourceId) continue; const key = `${resourceId}:${booking.dayOfWeek}`; const values = map.get(key) ?? []; values.push(booking); map.set(key, values); }
    const clashes = (window: SolverWindow, bookings: SolverBooking[]) => bookings.some(booking => overlap(window, booking) || !booking.clockOnly && sameCell(window, booking));
    return cls.requirements.map(requirement => ({ ...requirement, classId: cls.classId, remaining: requirement.periodsPerWeek, last: -1, candidates: cls.windows.filter(window => !clashes(window, teacherBookings.get(`${requirement.teacherId}:${window.dayOfWeek}`) ?? [])).flatMap(window => cls.roomIds.filter(roomId => !clashes(window, roomBookings.get(`${roomId}:${window.dayOfWeek}`) ?? [])).map(roomId => ({ ...window, roomId }))).map((slot, order) => ({ ...slot, order, classId: cls.classId, teacherId: requirement.teacherId, subjectId: requirement.subjectId })) }));
  }).sort((a, b) => a.classId.localeCompare(b.classId) || a.subjectId.localeCompare(b.subjectId));
  const selected: Slot[] = [];
  let visited = 0, limited = false;
  const options = (task: typeof tasks[number]) => task.candidates.filter(candidate => candidate.order > task.last && !selected.some(slot => (slot.classId === candidate.classId || slot.teacherId === candidate.teacherId || slot.roomId === candidate.roomId) && (sameCell(slot, candidate) || overlap(slot, candidate))) && selected.filter(slot => slot.classId === task.classId && slot.subjectId === task.subjectId && slot.dayOfWeek === candidate.dayOfWeek).length < task.maxPerDay);
  function search(): boolean {
    if (tasks.every(task => task.remaining === 0)) return true;
    if (++visited > maxNodes || performance.now() > deadline) { limited = true; return false; }
    const choices = tasks.filter(task => task.remaining > 0).map(task => ({ task, candidates: options(task) }));
    if (choices.some(({ task, candidates }) => new Set(candidates.map(slot => `${slot.dayOfWeek}:${slot.periodNumber}`)).size < task.remaining)) return false;
    choices.sort((a, b) => a.candidates.length / a.task.remaining - b.candidates.length / b.task.remaining || a.task.classId.localeCompare(b.task.classId) || a.task.subjectId.localeCompare(b.task.subjectId));
    const { task, candidates } = choices[0];
    candidates.sort((a, b) => selected.filter(slot => slot.classId === task.classId && slot.subjectId === task.subjectId && slot.dayOfWeek === a.dayOfWeek).length - selected.filter(slot => slot.classId === task.classId && slot.subjectId === task.subjectId && slot.dayOfWeek === b.dayOfWeek).length || a.order - b.order);
    for (const candidate of candidates) {
      const previous = task.last; task.last = candidate.order; task.remaining--; selected.push(candidate);
      if (search()) return true;
      selected.pop(); task.remaining++; task.last = previous;
      if (limited) return false;
    }
    return false;
  }
  if (!search()) return { status: limited ? "SEARCH_LIMIT" : "NO_SOLUTION", visited, timetables: [] };
  return { status: "SOLVED", visited, timetables: classes.map(cls => ({ operation: "timetable.create_draft", classId: cls.classId, academicYear: cls.academicYear, term, slots: selected.filter(slot => slot.classId === cls.classId).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber).map((slot, index) => ({ id: `school-lesson-${index + 1}`, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, startTime: slot.startTime, endTime: slot.endTime, subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, slotType: "CLASS" })) })) };
}
