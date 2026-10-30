/**
 * SKO-502 (plan F8): the calm control room for one live sitting.
 *
 * - Board: every rostered candidate with a state read from the server (NOT_STARTED, SAVED, UNSAVED when the
 *   last save is old, PAUSED, SUBMITTED, EXPIRED), the roll number, last save time and integrity observation
 *   count, plus the server's own time so the client can show how fresh the board is. No answer is read.
 * - Extend: bulk and idempotent per key, with a per-attempt outcome; the on-duty teacher may add up to 15
 *   minutes, a manager up to 60. The candidate's clock grows on its next save or notice poll.
 * - Close: ends an attempt now (the expiry worker submits it with its saved answers), with a reason.
 */
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { isSchoolAiManager } from "./access";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { schoolAiTransaction } from "./transaction";

export const BOARD_UNSAVED_SECONDS = 120;
export const TEACHER_EXTEND_LIMIT_MINUTES = 15;
export const MANAGER_EXTEND_LIMIT_MINUTES = 60;

export type BoardState = "NOT_STARTED" | "SAVED" | "UNSAVED" | "PAUSED" | "SUBMITTED" | "EXPIRED";
/** Pure: one candidate's board state. */
export function boardState(attempt: { status: string; pausedAt: Date | null; deadlineAt: Date; updatedAt: Date } | null, now: Date): BoardState {
  if (!attempt) return "NOT_STARTED";
  if (attempt.status !== "IN_PROGRESS") return attempt.status === "EXPIRED" ? "EXPIRED" : "SUBMITTED";
  if (attempt.pausedAt) return "PAUSED";
  if (attempt.deadlineAt <= now) return "EXPIRED";
  return now.getTime() - attempt.updatedAt.getTime() > BOARD_UNSAVED_SECONDS * 1000 ? "UNSAVED" : "SAVED";
}

export async function controlBoard(user: AuthUser, assignmentId: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx, "SUPERVISION");
    if (student) throw new ApiError("Exam unavailable.", 404);
    await staffExamAccess(user, assignment, "view", tx, "SUPERVISION");
    const roster = Array.isArray(assignment.studentIds) ? assignment.studentIds as string[] : [];
    const [pupils, attempts, observations] = await Promise.all([
      tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: roster } }, select: { id: true, fullName: true, rollNo: true } }),
      tx.schoolAiExamAttempt.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId }, select: { id: true, studentId: true, status: true, pausedAt: true, deadlineAt: true, updatedAt: true, sequence: true } }),
      tx.schoolAiExamIntegrityEvent.groupBy({ by: ["attemptId"], where: { schoolId: user.schoolId, assignmentId }, _count: { _all: true } }),
    ]);
    const byStudent = new Map(attempts.map(row => [row.studentId, row]));
    const seen = new Map(observations.map(row => [row.attemptId, row._count._all]));
    const rows = pupils.map(pupil => {
      const attempt = byStudent.get(pupil.id) ?? null;
      return { studentId: pupil.id, name: pupil.fullName, rollNo: pupil.rollNo, state: boardState(attempt, now), attemptId: attempt?.id ?? null, lastSavedAt: attempt?.updatedAt.toISOString() ?? null, deadlineAt: attempt?.deadlineAt.toISOString() ?? null, observations: attempt ? seen.get(attempt.id) ?? 0 : 0 };
    }).sort((a, b) => (a.rollNo ?? "").localeCompare(b.rollNo ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name));
    const counts = rows.reduce<Record<BoardState, number>>((sum, row) => ({ ...sum, [row.state]: sum[row.state] + 1 }), { NOT_STARTED: 0, SAVED: 0, UNSAVED: 0, PAUSED: 0, SUBMITTED: 0, EXPIRED: 0 });
    return { assignmentId, title: assignment.title, startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(), serverTime: now.toISOString(), counts, rows, extendLimit: isSchoolAiManager(user) ? MANAGER_EXTEND_LIMIT_MINUTES : TEACHER_EXTEND_LIMIT_MINUTES };
  });
}

export const extendInput = z.strictObject({ attemptIds: z.array(z.string().min(1).max(128)).min(1).max(500), minutes: z.number().int().min(1).max(MANAGER_EXTEND_LIMIT_MINUTES), reason: z.string().trim().min(3).max(300), idempotencyKey: z.string().min(8).max(120) });
export async function extendAttempts(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = extendInput.parse(raw);
  const limit = isSchoolAiManager(user) ? MANAGER_EXTEND_LIMIT_MINUTES : TEACHER_EXTEND_LIMIT_MINUTES;
  if (input.minutes > limit) throw new ApiError(`You can extend by at most ${limit} minutes.`, 403, "EXTEND_ABOVE_LIMIT");
  return schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx, "SUPERVISION");
    if (student) throw new ApiError("Only exam staff can extend an attempt.", 403);
    await staffExamAccess(user, assignment, "add", tx, "SUPERVISION");
    const now = new Date();
    const outcomes: Array<{ attemptId: string; outcome: "EXTENDED" | "ALREADY_APPLIED" | "NOT_IN_PROGRESS"; deadlineAt?: string }> = [];
    for (const attemptId of [...new Set(input.attemptIds)]) {
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId } });
      if (!attempt || attempt.status !== "IN_PROGRESS" || (!attempt.pausedAt && attempt.deadlineAt <= now)) { outcomes.push({ attemptId, outcome: "NOT_IN_PROGRESS" }); continue; }
      const applied = await tx.auditLog.count({ where: { schoolId: user.schoolId, tableName: "school_ai_exam_attempts", recordId: attempt.id, newValue: { path: ["extensionKey"], equals: input.idempotencyKey } } });
      if (applied) { outcomes.push({ attemptId, outcome: "ALREADY_APPLIED", deadlineAt: attempt.deadlineAt.toISOString() }); continue; }
      const deadlineAt = new Date(attempt.deadlineAt.getTime() + input.minutes * 60_000);
      const moved = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", deadlineAt: attempt.deadlineAt }, data: { deadlineAt } });
      if (moved.count !== 1) { outcomes.push({ attemptId, outcome: "NOT_IN_PROGRESS" }); continue; }
      await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId: assignment.campusId, before: { deadlineAt: attempt.deadlineAt.toISOString() }, after: { deadlineAt: deadlineAt.toISOString(), extendedMinutes: input.minutes, extensionKey: input.idempotencyKey, reason: input.reason } });
      outcomes.push({ attemptId, outcome: "EXTENDED", deadlineAt: deadlineAt.toISOString() });
    }
    return { outcomes };
  });
}

export const closeInput = z.strictObject({ attemptIds: z.array(z.string().min(1).max(128)).min(1).max(500), reason: z.string().trim().min(3).max(300) });
/** End attempts now; the expiry worker submits each with its saved answers on its next pass. */
export async function closeAttempts(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = closeInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, tx, "SUPERVISION");
    if (student) throw new ApiError("Only exam staff can close an attempt.", 403);
    await staffExamAccess(user, assignment, "add", tx, "SUPERVISION");
    const now = new Date();
    const outcomes: Array<{ attemptId: string; outcome: "CLOSED" | "NOT_IN_PROGRESS" }> = [];
    for (const attemptId of [...new Set(input.attemptIds)]) {
      const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, status: "IN_PROGRESS" } });
      if (!attempt) { outcomes.push({ attemptId, outcome: "NOT_IN_PROGRESS" }); continue; }
      await tx.schoolAiExamAttempt.update({ where: { id: attempt.id }, data: { deadlineAt: now, pausedAt: null } });
      await tx.schoolAiExamPause.updateMany({ where: { schoolId: user.schoolId, attemptId: attempt.id, endedAt: null }, data: { endedAt: now, endedById: user.userId, restoredMs: 0 } });
      await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId: assignment.campusId, before: { deadlineAt: attempt.deadlineAt.toISOString() }, after: { closedAt: now.toISOString(), reason: input.reason } });
      outcomes.push({ attemptId, outcome: "CLOSED" });
    }
    return { outcomes };
  });
}
