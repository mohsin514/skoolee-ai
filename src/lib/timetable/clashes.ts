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

/**
 * Group teaching slots by day+period and keep the groups that land the teacher
 * in more than one class at once. Two slots for the *same* class are not a
 * clash — that is just a double period.
 */
export function detectSlotClashes(slots: ClashSlot[]): SlotClash[] {
  const byKey = new Map<string, ClashSlot[]>();
  for (const slot of slots) {
    if (slot.slotType !== "CLASS" || !slot.subject) continue;
    const key = `${slot.dayOfWeek}-${slot.periodNumber}`;
    byKey.set(key, [...(byKey.get(key) || []), slot]);
  }

  return [...byKey.entries()]
    .map(([key, group]) => {
      const classes = [...new Set(group.map(classLabelOf))];
      return {
        key,
        dayOfWeek: group[0].dayOfWeek,
        periodNumber: group[0].periodNumber,
        startTime: group[0].startTime,
        classes,
      };
    })
    .filter((clash) => clash.classes.length > 1)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNumber - b.periodNumber);
}

/** Slot ids that participate in a clash, for highlighting individual cards. */
export function clashingSlotIds(slots: ClashSlot[]): Set<string> {
  const keys = new Set(detectSlotClashes(slots).map((c) => c.key));
  return new Set(
    slots
      .filter((s) => keys.has(`${s.dayOfWeek}-${s.periodNumber}`))
      .map((s) => s.id),
  );
}
