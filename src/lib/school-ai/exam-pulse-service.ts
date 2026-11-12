/**
 * SKO-500: Live Pulse for one sitting. Reads only whether each autosaved response is present and each
 * live attempt's last save time; the output (`ExamPulse`) has no field that can carry answer text.
 */
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { scopedAssignment } from "./exam-service";
import { schoolAiTransaction } from "./transaction";
import { pulseFromAttempts } from "./exam-pulse";

type PresenceRow = { id: string; status: string; updatedAt: Date; pausedAt: Date | null; answered: string[] };
/** Matches a value that JavaScript's String.prototype.trim() would reduce to "" (WhiteSpace + LineTerminator). */
export const BLANK_PATTERN = "^[\\u0009-\\u000d\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]*$";

export async function getExamPulse(user: AuthUser, assignmentId: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper, student } = await scopedAssignment(user, assignmentId, tx, "SUPERVISION");
    if (student) throw new ApiError("Live room progress is available only to exam staff.", 403);
    // SKAI-1883: presence is worked out in SQL, so answer text never leaves the database on a poll.
    const rows = await tx.$queryRaw<PresenceRow[]>`
      SELECT a.id, a.status, a.updated_at AS "updatedAt", a.paused_at AS "pausedAt",
        ARRAY(SELECT e.key FROM jsonb_each(CASE WHEN jsonb_typeof(a.responses) = 'object' THEN a.responses ELSE '{}'::jsonb END) e
          WHERE jsonb_typeof(e.value) = 'string' AND (e.value #>> '{}') !~ ${BLANK_PATTERN}) AS answered
      FROM school_ai_exam_attempts a
      WHERE a.school_id = ${user.schoolId} AND a.campus_id = ${assignment.campusId} AND a.assignment_id = ${assignment.id} AND a.status = 'IN_PROGRESS'
      LIMIT 2000`;
    const attempts = rows.map(row => ({ ...row, responses: Object.fromEntries(row.answered.map(key => [key, "x"])) }));
    const pulse = pulseFromAttempts(paper.questions.map(question => ({ id: question.id, sectionId: question.sectionId })), attempts.map(attempt => ({ id: attempt.id, status: attempt.status, responses: attempt.responses, updatedAt: attempt.updatedAt.toISOString(), pausedAt: attempt.pausedAt?.toISOString() ?? null })), now.toISOString());
    return { assignmentId: assignment.id, title: assignment.title, startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(), checkedAt: now.toISOString(), sections: paper.blueprint.sections.map(section => ({ id: section.id, title: section.title })), pulse };
  });
}
