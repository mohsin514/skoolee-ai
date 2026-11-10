// SKAI-1257: intake capacity. Open offers and accepted places are counted against a class's seats
// alongside the pupils already in it, so the office is warned before it over-offers. A class with no
// capacity set is never treated as full or empty: the count is reported without a limit.

/** Applications that hold (or may soon hold) a seat in the class they were offered. */
export const SEAT_HOLDING = ["OFFERED", "ACCEPTED"] as const;

export type IntakeSeats = { classId: string; capacity: number | null; enrolled: number; offered: number; committed: number; over: boolean };

export function seatSummary(classId: string, capacity: number | null, enrolled: number, offered: number): IntakeSeats {
  const committed = enrolled + offered;
  return { classId, capacity, enrolled, offered, committed, over: capacity != null && committed > capacity };
}

type SeatDb = {
  class: { findFirst(args: { where: { id: string; campusId: string; schoolId: string }; select: { capacity: true } }): Promise<{ capacity: number | null } | null> };
  student: { count(args: { where: Record<string, unknown> }): Promise<number> };
  admissionApplication: { count(args: { where: Record<string, unknown> }): Promise<number> };
};

/** Seats used in one class of this school and campus, counting open offers and accepted places. */
export async function intakeSeats(db: SeatDb, schoolId: string, campusId: string, classId: string): Promise<IntakeSeats | null> {
  const cls = await db.class.findFirst({ where: { id: classId, campusId, schoolId }, select: { capacity: true } });
  if (!cls) return null;
  const [enrolled, offered] = await Promise.all([
    db.student.count({ where: { schoolId, campusId, classId, archivedAt: null, status: "active" } }),
    db.admissionApplication.count({ where: { schoolId, campusId, intakeClassId: classId, status: { in: [...SEAT_HOLDING] } } }),
  ]);
  return seatSummary(classId, cls.capacity, enrolled, offered);
}
