/**
 * The vocabulary the date sheet and the seating planner use to describe a
 * problem (§80).
 *
 * Kept out of the route file so the planner UI imports the same definitions
 * the API produces — a conflict list is only useful if both ends agree on what
 * "blocking" means.
 */

export type ConflictKind =
  | "WEEKEND"
  | "HOLIDAY"
  | "CLASS_DOUBLE_BOOKED"
  | "ROOM_DOUBLE_BOOKED"
  | "ROOM_LESSON"
  | "ROOM_CAPACITY"
  | "NO_ROOM"
  | "OUTSIDE_WINDOW";

export interface BulkConflict {
  /** Which class the problem belongs to, or null when it is session-wide. */
  classLabel: string | null;
  subject: string | null;
  kind: ConflictKind;
  message: string;
  /** True when it stops the save; false when it is worth knowing but legal. */
  blocking: boolean;
}

/** Plain-language heading for a group of conflicts of one kind. */
export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  WEEKEND: "Falls on a weekend",
  HOLIDAY: "Falls on a holiday",
  CLASS_DOUBLE_BOOKED: "Class sits two papers at once",
  ROOM_DOUBLE_BOOKED: "Room hosts two papers at once",
  ROOM_LESSON: "Room is teaching a lesson",
  ROOM_CAPACITY: "Room is too small at exam spacing",
  NO_ROOM: "No room assigned",
  OUTSIDE_WINDOW: "Outside the exam window",
};

/** How to fix each kind, in one sentence an admin can act on. */
export const CONFLICT_FIXES: Record<ConflictKind, string> = {
  WEEKEND: "Move the paper to a working day, or change the campus weekend days.",
  HOLIDAY: "Move the paper, or shorten the holiday in the school calendar.",
  CLASS_DOUBLE_BOOKED: "Move one of the two papers to another period or day.",
  ROOM_DOUBLE_BOOKED: "Give one paper a different room, or move it to another period.",
  ROOM_LESSON: "Pick a free room, or unpublish the timetable that claims it.",
  ROOM_CAPACITY: "Add a second room, or use a hall — exam spacing is one candidate per bench.",
  NO_ROOM: "Assign rooms, or run the seating planner to fill them in automatically.",
  OUTSIDE_WINDOW: "Move the paper inside the window, or widen the session's dates.",
};
