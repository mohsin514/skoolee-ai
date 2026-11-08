import { ApiError } from "@/lib/api/scope";

// SKAI-1306: forward-only exam session lifecycle with readiness prerequisites.
export const EXAM_SESSION_ORDER = ["PLANNING", "SCHEDULED", "SEATED", "RUNNING", "COMPLETED"] as const;

type ScheduleRow = { _count: { rooms: number; seats: number } };
type TransitionDb = {
  exam: { count: (args: { where: { campusId: string; sessionId: string } }) => Promise<number> };
  examSchedule: { findMany: (args: { where: { campusId: string; exam: { sessionId: string } }; select: { _count: { select: { rooms: true; seats: true } } } }) => Promise<ScheduleRow[]> };
  mark: { count: (args: { where: { campusId: string; exam: { sessionId: string } } }) => Promise<number> };
};

export async function assertExamSessionTransition(db: TransitionDb, campusId: string, sessionId: string, from: string, to: string): Promise<void> {
  if (from === to) return;
  const fromIdx = EXAM_SESSION_ORDER.indexOf(from as never);
  const toIdx = EXAM_SESSION_ORDER.indexOf(to as never);
  if (fromIdx === EXAM_SESSION_ORDER.length - 1) {
    throw new ApiError("This exam session is completed and cannot change status.", 409);
  }
  if (toIdx !== fromIdx + 1) {
    throw new ApiError(`An exam session in ${from} can only move to ${EXAM_SESSION_ORDER[fromIdx + 1]}, one step at a time.`, 409);
  }
  const where = { campusId, exam: { sessionId } };
  if (to === "SCHEDULED") {
    if ((await db.exam.count({ where: { campusId, sessionId } })) === 0) throw new ApiError("Add at least one exam before scheduling this session.", 409);
    const schedules = await db.examSchedule.findMany({ where, select: { _count: { select: { rooms: true, seats: true } } } });
    if (schedules.length === 0) throw new ApiError("Schedule at least one paper before marking this session scheduled.", 409);
  }
  if (to === "SEATED" || to === "RUNNING") {
    const schedules = await db.examSchedule.findMany({ where, select: { _count: { select: { rooms: true, seats: true } } } });
    if (schedules.length === 0 || schedules.some((s) => s._count.rooms === 0 || s._count.seats === 0)) {
      throw new ApiError("Every scheduled paper needs a room and seat plan before this step.", 409);
    }
  }
  if (to === "COMPLETED") {
    if ((await db.mark.count({ where })) === 0) throw new ApiError("Enter marks before completing this exam session.", 409);
  }
}
