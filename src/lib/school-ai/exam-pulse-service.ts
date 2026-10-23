/**
 * SKO-500: Live Pulse for one sitting. Reads only whether each autosaved response is present and each
 * live attempt's last save time; the output (`ExamPulse`) has no field that can carry answer text.
 */
import type { AuthUser } from "@/lib/auth";
import { scopedAssignment } from "./exam-service";
import { schoolAiTransaction } from "./transaction";
import { pulseFromAttempts } from "./exam-pulse";

export async function getExamPulse(user: AuthUser, assignmentId: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
    if (paper === null || paper === undefined) throw new Error("Exam unavailable.");
    const attempts = await tx.schoolAiExamAttempt.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId: assignment.id, status: "IN_PROGRESS" }, select: { id: true, status: true, responses: true, updatedAt: true, pausedAt: true }, take: 2000 });
    const presence = (raw: unknown) => {
      const out: Record<string, string | undefined> = {};
      if (raw && typeof raw === "object") for (const [key, value] of Object.entries(raw as Record<string, unknown>)) out[key] = typeof value === "string" && value.trim() ? "x" : undefined;
      return out;
    };
    const pulse = pulseFromAttempts(paper.questions.map(question => ({ id: question.id, sectionId: question.sectionId })), attempts.map(attempt => ({ id: attempt.id, status: attempt.status, responses: presence(attempt.responses), updatedAt: attempt.updatedAt.toISOString(), pausedAt: attempt.pausedAt?.toISOString() ?? null })), now.toISOString());
    return { assignmentId: assignment.id, title: assignment.title, startsAt: assignment.startsAt.toISOString(), endsAt: assignment.endsAt.toISOString(), checkedAt: now.toISOString(), sections: paper.blueprint.sections.map(section => ({ id: section.id, title: section.title })), pulse };
  });
}
