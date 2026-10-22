import { randomUUID } from "node:crypto";
import type { Database } from "../queue/outbox";
import { paperDataSchema } from "./assessment";
import { responsesSchema, scoreObjectiveResponses, validateResponses } from "./exam";

export type ExamExpiryCursor = { deadlineAt: Date; id: string };
type Reference = ExamExpiryCursor & { schoolId: string; campusId: string };
type DueAttempt = Reference & { sequence: number; responses: unknown; paperSnapshot: unknown; processedAt: Date };
export type ExamExpiryResult = { examined: number; submitted: number; invalid: number; cursor: ExamExpiryCursor | null };

/**
 * Privileged worker entry point, never a browser/API operation. Cross-school
 * discovery selects references only. Each effect locks one attempt and pins
 * school + campus on every join/write, so parallel workers and autosaves cannot
 * overwrite each other. The database clock is authoritative.
 *
 * A keyset cursor lets other deadlines progress past a corrupt record. Invalid
 * records stay untouched and are retried on the next pass for operator repair.
 * No answer text, answer keys, student identities or scores leave this function.
 */
export async function expireSchoolAiAttempts(db: Database, options: { limit?: number; cursor?: ExamExpiryCursor | null; schoolId?: string } = {}): Promise<ExamExpiryResult> {
  const requested = options.limit ?? 100;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > 500) throw new Error("INVALID_EXAM_EXPIRY_LIMIT");
  const cursor = options.cursor;
  // An operator may scope a repair pass to one school; the normal worker omits it.
  const schoolId = options.schoolId ?? null;
  if (schoolId !== null && (!schoolId || schoolId.length > 128)) throw new Error("INVALID_EXAM_EXPIRY_SCHOOL");
  if (cursor && (!cursor.id || cursor.id.length > 128 || !Number.isFinite(cursor.deadlineAt.getTime()))) throw new Error("INVALID_EXAM_EXPIRY_CURSOR");
  const references = cursor
    ? await db.$queryRaw<Reference[]>`
      SELECT id, school_id AS "schoolId", campus_id AS "campusId", deadline_at AS "deadlineAt"
      FROM school_ai_exam_attempts
      WHERE status = 'IN_PROGRESS' AND deadline_at <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND (${schoolId}::text IS NULL OR school_id = ${schoolId})
        AND (deadline_at, id) > ((${cursor.deadlineAt}::timestamptz AT TIME ZONE 'UTC'), ${cursor.id})
      ORDER BY deadline_at, id LIMIT ${requested}`
    : await db.$queryRaw<Reference[]>`
      SELECT id, school_id AS "schoolId", campus_id AS "campusId", deadline_at AS "deadlineAt"
      FROM school_ai_exam_attempts
      WHERE status = 'IN_PROGRESS' AND deadline_at <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND (${schoolId}::text IS NULL OR school_id = ${schoolId})
      ORDER BY deadline_at, id LIMIT ${requested}`;
  let submitted = 0, invalid = 0;
  for (const reference of references) {
    const result = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DueAttempt[]>`
        SELECT a.id, a.school_id AS "schoolId", a.campus_id AS "campusId",
          a.deadline_at AS "deadlineAt", a.sequence, a.responses,
          e.paper_snapshot AS "paperSnapshot", (statement_timestamp() AT TIME ZONE 'UTC') AS "processedAt"
        FROM school_ai_exam_attempts a
        JOIN school_ai_exam_assignments e ON e.id = a.assignment_id AND e.school_id = a.school_id AND e.campus_id = a.campus_id
        WHERE a.id = ${reference.id} AND a.school_id = ${reference.schoolId} AND a.campus_id = ${reference.campusId}
          AND a.status = 'IN_PROGRESS' AND a.deadline_at <= (statement_timestamp() AT TIME ZONE 'UTC')
          AND e.mode IN ('STANDARD', 'SECURE_BROWSER') -- SKO-501: secure-browser attempts expire the same way (verified gap)
        FOR UPDATE OF a SKIP LOCKED`;
      const attempt = rows[0];
      if (!attempt) return "skipped";
      const paper = paperDataSchema.safeParse(attempt.paperSnapshot);
      const responses = responsesSchema.safeParse(attempt.responses);
      if (!paper.success || !responses.success || validateResponses(paper.data, responses.data).length) return "invalid";
      const score = scoreObjectiveResponses(paper.data, responses.data);
      const changed = await tx.$executeRaw`
        UPDATE school_ai_exam_attempts SET status = 'SUBMITTED', submitted_at = deadline_at,
          score_proposal = ${JSON.stringify(score)}::jsonb, updated_at = (${attempt.processedAt}::timestamptz AT TIME ZONE 'UTC')
        WHERE id = ${attempt.id} AND school_id = ${attempt.schoolId} AND campus_id = ${attempt.campusId}
          AND status = 'IN_PROGRESS' AND sequence = ${attempt.sequence}
          AND deadline_at = (${attempt.deadlineAt}::timestamptz AT TIME ZONE 'UTC')`;
      if (changed !== 1) return "skipped";
      // An automatic deadline completion is attributed to the worker, never to a
      // student pretending to press Submit. Audit and submission commit together.
      const details = { action: "deadline_submission", source: "exam_expiry_worker", deadlineAt: attempt.deadlineAt.toISOString(), processedAt: attempt.processedAt.toISOString(), sequence: attempt.sequence };
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, school_id, table_name, record_id, user_id, old_value, new_value, created_at)
        VALUES (${randomUUID()}, ${attempt.schoolId}, 'school_ai_exam_attempts', ${attempt.id}, 'system:school-ai-expiry',
          '{"status":"IN_PROGRESS"}'::jsonb, ${JSON.stringify(details)}::jsonb, (${attempt.processedAt}::timestamptz AT TIME ZONE 'UTC'))`;
      return "submitted";
    });
    if (result === "submitted") submitted++;
    if (result === "invalid") invalid++;
  }
  const last = references.at(-1);
  return { examined: references.length, submitted, invalid, cursor: references.length === requested && last ? { deadlineAt: last.deadlineAt, id: last.id } : null };
}
