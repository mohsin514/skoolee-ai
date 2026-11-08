/**
 * Client-side twin of `detectTeacherClashes` in `@/lib/api/timetable-sync`.
 *
 * The office sees double-bookings on its own board, but the teacher whose day
 * is actually broken saw nothing — three simultaneous 09:20 classes rendered as
 * three ordinary cards. This derives the same conflicts from the slots the
 * teacher pages already fetch, so no extra round-trip is needed.
 */

export interface ClashSlot {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  slotType: string;
  subject: { id: string; name: string } | null;
  className: string;
  classSection: string | null;
}

export interface SlotClash {
  /** `${dayOfWeek}-${periodNumber}` — the key the slots collide on. */
  key: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  classes: string[];
}

export const DAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function classLabelOf(slot: ClashSlot) {
  return `${slot.className}${slot.classSection ? ` ${slot.classSection}` : ""}`;
}

/** SKO-403: two lessons collide when their clock times overlap, whatever their period numbers. */
function overlapping(a: ClashSlot, b: ClashSlot) {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return a.periodNumber === b.periodNumber;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Group teaching slots whose times overlap and keep the groups that land the teacher in more than one
 * class at once. Two slots for the *same* class are not a clash — that is just a double period.
 */
export function detectSlotClashes(slots: ClashSlot[]): SlotClash[] {
  const teaching = slots.filter((slot) => slot.slotType === "CLASS" && slot.subject)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime) || a.periodNumber - b.periodNumber);
  const groups: ClashSlot[][] = [];
  for (const slot of teaching) {
    const group = groups.find((items) => items.some((other) => overlapping(slot, other)));
    if (group) group.push(slot); else groups.push([slot]);
  }
  return groups
    .map((group) => ({ key: `${group[0].dayOfWeek}-${group[0].periodNumber}`, dayOfWeek: group[0].dayOfWeek, periodNumber: group[0].periodNumber, startTime: group[0].startTime, classes: [...new Set(group.map(classLabelOf))], ids: group.map((slot) => slot.id) }))
    .filter((clash) => clash.classes.length > 1)
    .map(({ ids: _ids, ...clash }) => clash);
}

/** Slot ids that participate in a clash, for highlighting individual cards. */
export function clashingSlotIds(slots: ClashSlot[]): Set<string> {
  const teaching = slots.filter((slot) => slot.slotType === "CLASS" && slot.subject);
  return new Set(teaching.filter((slot) => teaching.some((other) => other.id !== slot.id && classLabelOf(other) !== classLabelOf(slot) && overlapping(slot, other))).map((slot) => slot.id));
}
