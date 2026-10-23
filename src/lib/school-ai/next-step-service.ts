/**
 * SKO-500: gathers the facts `nextStudioStep` decides on, for one person, inside their own scope.
 * Every list is bounded; nothing here reads a response, a mark or a family record.
 */
import type { AuthUser } from "@/lib/auth";
import { isSchoolAiManager, getAssignedWorkspaceSubjects } from "./access";
import { membersHeadedBy } from "./department-heads";
import { mySlots } from "./paper-slot-service";
import { schoolAiTransaction } from "./transaction";
import { paperDataSchema } from "./assessment";
import { itemStateFor } from "./item-review";
import { nextStepHref, nextStudioStep, type NextStep, type NextStepInput } from "./next-studio-step";

export async function studioNextStep(user: AuthUser, now = new Date()): Promise<{ step: NextStep; href: string; facts: { slotsOwed: number; toApprove: number; toModerate: number } }> {
  const today = now.toISOString().slice(0, 10);
  const slots = await mySlots(user, today).catch(() => ({ viewerId: user.userId, slots: [], scope: "NONE" as const }));
  const label = (slot: { subjectName: string; gradeName: string }) => `${slot.subjectName} · ${slot.gradeName}`;
  const facts = await schoolAiTransaction(user, async tx => {
    const campus = user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" };
    const manager = isSchoolAiManager(user);
    const members = manager ? [] : await membersHeadedBy(tx, user.schoolId, user.userId);
    // Approvals waiting on this person: managers see the campus's; a head sees the department's; a teacher their own
    // syllabus drafts that cite an uploaded file (the classroom tier lets them approve those).
    const approvals = await tx.schoolAiRecord.findMany({
      where: manager ? { schoolId: user.schoolId, ...campus, kind: { in: ["CURRICULUM", "PAPER"] }, status: "IN_REVIEW" }
        : members.length ? { schoolId: user.schoolId, ...campus, kind: "CURRICULUM", status: "IN_REVIEW", createdById: { in: members } }
        : { schoolId: user.schoolId, ...campus, kind: "CURRICULUM", status: "DRAFT", createdById: user.userId, data: { path: ["approvalBundle"], not: { equals: null } } },
      select: { id: true, kind: true, title: true }, orderBy: { updatedAt: "asc" }, take: 20,
    });
    const papers = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, ...campus, kind: "PAPER", createdById: user.userId, status: { in: ["DRAFT", "IN_REVIEW"] } }, select: { id: true, title: true, data: true }, orderBy: { updatedAt: "desc" }, take: 20 });
    const itemsToReview = papers.map(paper => {
      const parsed = paperDataSchema.safeParse(paper.data);
      const count = parsed.success ? parsed.data.questions.map(itemStateFor).filter(state => state === "DRAFT" || state === "NEEDS_CORRECTION").length : 0;
      return { paperId: paper.id, title: paper.title, count };
    }).filter(row => row.count > 0);
    const sittings = await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, ...campus, ...(manager ? {} : { createdById: user.userId }), status: "ACTIVE", startsAt: { lte: now }, endsAt: { gte: now } }, select: { id: true, title: true }, take: 5 });
    let hasApprovedCurriculum: boolean;
    if (user.role === "TEACHER") {
      const subjects = await getAssignedWorkspaceSubjects(user, tx);
      hasApprovedCurriculum = subjects.length > 0 && Boolean(await tx.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, ...campus, kind: "CURRICULUM", status: "APPROVED", subjectId: { in: subjects.map(subject => subject.id) } }, select: { id: true } }));
    } else hasApprovedCurriculum = Boolean(await tx.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, ...campus, kind: "CURRICULUM", status: "APPROVED" }, select: { id: true } }));
    return { approvals, itemsToReview, sittings, hasApprovedCurriculum };
  });
  const input: NextStepInput = {
    today, saveFailed: false, blockingRehearsals: [],
    mySlots: slots.slots.filter(slot => slot.authorUserId === user.userId).map(slot => ({ id: slot.id, title: label(slot), status: slot.status, dueOn: slot.dueOn })),
    toModerate: slots.slots.filter(slot => slot.moderatorUserId === user.userId && slot.status === "READY_FOR_REVIEW").map(slot => ({ id: slot.id, title: label(slot), dueOn: slot.dueOn })),
    toApprove: facts.approvals.map(row => ({ id: row.id, kind: row.kind as "CURRICULUM" | "PAPER", title: row.title })),
    itemsToReview: facts.itemsToReview, openSittings: facts.sittings, releasedWithoutNextLesson: [],
    hasApprovedCurriculum: facts.hasApprovedCurriculum,
  };
  const step = nextStudioStep(input);
  return { step, href: nextStepHref(step), facts: { slotsOwed: input.mySlots.length, toApprove: input.toApprove.length, toModerate: input.toModerate.length } };
}
