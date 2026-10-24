import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { createAssignment } from "@/lib/assignments/service";
import { schoolAiTransaction } from "./transaction";
import { getWorkspaceRecordInTransaction, updateWorkspaceRecordInTransaction } from "./repository";
import { loadWorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema } from "./assessment";
import { copyLessonPlan, lessonPlanIssues, validateLessonPlan, type PlanGroup } from "./learning";

/**
 * SKO-414: what a teacher does with a lesson plan after drafting it — private
 * temporary groups, a pre-publication check with repair steps, publishing an
 * activity as an assignment draft for the whole class or one group, recording
 * whether it was taught, and copying content to another class. Working state
 * lives in LessonPlanState (versioned by LessonPlanEvent) so none of it
 * reopens an approved curriculum.
 */

type Delivery = { status: "TAUGHT" | "NOT_TAUGHT"; on: string; reflection: string; recordedById: string };
type Published = { activityIndex: number; groupId: string | null; assignmentId: string };
const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
// The generic minutes error is replaced by the repair-path version from lessonPlanIssues.
const contentIssues = (plan: Parameters<typeof validateLessonPlan>[0], curriculum: Parameters<typeof validateLessonPlan>[1]) => validateLessonPlan(plan, curriculum).filter(issue => !issue.startsWith("Activity minutes must equal"));
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function load(user: AuthUser, curriculumId: string, planId: string, tx: TxClient) {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  const record = await getWorkspaceRecordInTransaction(user, curriculumId, tx, permissions);
  if (record.kind !== "CURRICULUM" || !record.campusId) throw new ApiError("Choose a curriculum.", 422);
  const curriculum = curriculumDataSchema.parse(record.data);
  const plan = curriculum.lessonPlans?.find(row => row.id === planId);
  if (!plan) throw new ApiError("Lesson plan not found. Save the curriculum first.", 404);
  const state = await tx.lessonPlanState.findFirst({ where: { curriculumId, planId } });
  return { record, campusId: record.campusId, curriculum, plan, state, permissions };
}

function assertOwner(user: AuthUser, plan: { ownerId?: string }) {
  // The owning teacher manages the plan's groups and delivery; school leaders may step in.
  if (plan.ownerId !== user.userId && !canManageOperations(user)) throw new ApiError("Only the teacher who owns this lesson plan can change it.", 403);
}

async function context(tx: TxClient, user: AuthUser, campusId: string, classId: string, resourceIds: string[]) {
  const [periods, resources, roster] = await Promise.all([
    tx.periodDefinition.findMany({ where: { campusId, timeType: "CLASS" }, select: { startTime: true, endTime: true } }),
    resourceIds.length ? tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId, id: { in: resourceIds }, status: "PUBLISHED", audience: { in: ["CLASS", "CLASS_AND_GUARDIANS"] } }, select: { id: true } }) : [],
    tx.student.findMany({ where: { schoolId: user.schoolId, classId, archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } }),
  ]);
  const lengths = periods.map(p => minutes(p.endTime) - minutes(p.startTime)).filter(n => n > 0);
  return { lessonMinutes: lengths.length ? Math.max(...lengths) : null, publishedResourceIds: resources.map(r => r.id), roster };
}

async function saveState(tx: TxClient, user: AuthUser, base: { campusId: string; curriculumId: string; planId: string }, state: { id: string; version: number } | null, expectedVersion: number, data: { groups?: PlanGroup[]; delivery?: Delivery; publishedActivities?: Published[] }, kind: string, detail: object) {
  if ((state?.version ?? 0) !== expectedVersion) throw new ApiError("This lesson plan changed meanwhile. Reload and try again.", 409);
  let saved;
  if (state) {
    const updated = await tx.lessonPlanState.updateMany({ where: { id: state.id, version: expectedVersion }, data: { ...data, version: { increment: 1 }, updatedById: user.userId } as never });
    if (!updated.count) throw new ApiError("This lesson plan changed meanwhile. Reload and try again.", 409);
    saved = await tx.lessonPlanState.findUniqueOrThrow({ where: { id: state.id } });
  } else {
    saved = await tx.lessonPlanState.create({ data: { schoolId: user.schoolId, campusId: base.campusId, curriculumId: base.curriculumId, planId: base.planId, updatedById: user.userId, ...data } as never });
  }
  await tx.lessonPlanEvent.create({ data: { schoolId: user.schoolId, stateId: saved.id, version: saved.version, kind, actorId: user.userId, detail } });
  return saved;
}

export async function viewLessonPlan(user: AuthUser, curriculumId: string, planId: string) {
  return schoolAiTransaction(user, async tx => {
    const { campusId, curriculum, plan, state, record } = await load(user, curriculumId, planId, tx);
    const ctx = await context(tx, user, campusId, curriculum.classId, plan.resourceIds ?? []);
    const groups = (state?.groups ?? []) as PlanGroup[];
    const canManage = plan.ownerId === user.userId || canManageOperations(user);
    const owner = plan.ownerId ? await tx.user.findFirst({ where: { id: plan.ownerId }, select: { fullName: true } }) : null;
    const events = state ? await tx.lessonPlanEvent.findMany({ where: { stateId: state.id }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
    return {
      curriculum: { id: record.id, version: record.version, status: record.status, classId: curriculum.classId },
      plan: { id: plan.id, title: plan.title, origin: plan.origin ?? null, owner: owner?.fullName ?? null, confirmed: plan.confirmed, durationMinutes: plan.durationMinutes,
        plannedMinutes: plan.activities.reduce((sum, a) => sum + a.minutes, 0), activities: plan.activities.map((a, index) => ({ index, title: a.title, minutes: a.minutes })) },
      issues: [...contentIssues(plan, curriculum), ...lessonPlanIssues(plan, { ...ctx, rosterIds: ctx.roster.map(r => r.id), groups })],
      lessonMinutes: ctx.lessonMinutes, canManage, stateVersion: state?.version ?? 0,
      // Group membership is visible only to staff who manage the plan; it is never part of any learner-facing record.
      groups: canManage ? groups : [], roster: canManage ? ctx.roster.map(r => ({ id: r.id, name: r.fullName, rollNo: r.rollNo })) : [],
      delivery: (state?.delivery ?? null) as Delivery | null, published: (state?.publishedActivities ?? []) as Published[],
      events: events.map(e => ({ version: e.version, kind: e.kind, at: e.createdAt })),
    };
  });
}

const GroupsInput = z.object({ curriculumId: z.string().min(1), planId: z.string().min(1), expectedVersion: z.number().int().min(0), groups: z.array(z.array(z.string().min(1)).max(200)).max(8) }).strict();
export async function setLessonGroups(user: AuthUser, raw: unknown) {
  const input = GroupsInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { campusId, curriculum, plan, state } = await load(user, input.curriculumId, input.planId, tx);
    assertOwner(user, plan);
    const roster = new Set((await tx.student.findMany({ where: { schoolId: user.schoolId, classId: curriculum.classId, archivedAt: null }, select: { id: true } })).map(s => s.id));
    const seen = new Set<string>();
    const groups: PlanGroup[] = input.groups.filter(ids => ids.length).map((ids, index) => {
      for (const id of ids) {
        if (!roster.has(id)) throw new ApiError("A group may include only learners in this class.", 400);
        if (seen.has(id)) throw new ApiError("Each learner can be in only one group of a lesson.", 400);
        seen.add(id);
      }
      // Neutral, server-assigned labels: never "weak" or "top" groups.
      return { id: (state?.groups as PlanGroup[] | undefined)?.[index]?.id ?? randomUUID(), label: `Group ${LABELS[index]}`, studentIds: [...new Set(ids)] };
    });
    const saved = await saveState(tx, user, { campusId, curriculumId: input.curriculumId, planId: input.planId }, state, input.expectedVersion, { groups }, "GROUPS", { groups: groups.map(g => ({ label: g.label, size: g.studentIds.length })) });
    return { version: saved.version, groups };
  });
}

const DeliveryInput = z.object({ curriculumId: z.string().min(1), planId: z.string().min(1), expectedVersion: z.number().int().min(0), status: z.enum(["TAUGHT", "NOT_TAUGHT"]), on: z.string().date(), reflection: z.string().trim().max(1000) }).strict();
export async function recordLessonDelivery(user: AuthUser, raw: unknown) {
  const input = DeliveryInput.parse(raw);
  if (input.on > new Date().toISOString().slice(0, 10)) throw new ApiError("Record a lesson on or after the day it happened.", 400);
  return schoolAiTransaction(user, async tx => {
    const { campusId, plan, state } = await load(user, input.curriculumId, input.planId, tx);
    assertOwner(user, plan);
    const delivery: Delivery = { status: input.status, on: input.on, reflection: input.reflection, recordedById: user.userId };
    const saved = await saveState(tx, user, { campusId, curriculumId: input.curriculumId, planId: input.planId }, state, input.expectedVersion, { delivery }, "DELIVERY", { status: input.status, on: input.on, reflection: input.reflection });
    return { version: saved.version, delivery };
  });
}

const PublishInput = z.object({ curriculumId: z.string().min(1), planId: z.string().min(1), activityIndex: z.number().int().min(0).max(11), groupId: z.string().min(1).nullable(), dueLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }).strict();
/** Creates an assignment DRAFT; the teacher releases it through the assignment workflow, which shows and freezes the audience. */
export async function publishLessonActivity(user: AuthUser, raw: unknown) {
  const input = PublishInput.parse(raw);
  const prepared = await schoolAiTransaction(user, async tx => {
    const { campusId, curriculum, plan, state, record } = await load(user, input.curriculumId, input.planId, tx);
    assertOwner(user, plan);
    const groups = (state?.groups ?? []) as PlanGroup[];
    const ctx = await context(tx, user, campusId, curriculum.classId, plan.resourceIds ?? []);
    const issues = [...contentIssues(plan, curriculum), ...lessonPlanIssues(plan, { ...ctx, rosterIds: ctx.roster.map(r => r.id), groups })];
    if (issues.length) throw Object.assign(new ApiError(`Resolve ${issues.length} issue(s) before publishing.`, 409), { issues });
    const activity = plan.activities[input.activityIndex];
    if (!activity) throw new ApiError("Choose an activity in this plan.", 400);
    const group = input.groupId ? groups.find(g => g.id === input.groupId) : null;
    if (input.groupId && !group) throw new ApiError("Choose a group of this lesson.", 400);
    const existing = ((state?.publishedActivities ?? []) as Published[]).find(p => p.activityIndex === input.activityIndex && p.groupId === input.groupId);
    return { campusId, curriculum, plan, state, record, activity, group, existing };
  });
  if (prepared.existing) return { assignmentId: prepared.existing.assignmentId, duplicate: true };
  const title = `${prepared.plan.title} — ${prepared.activity.title}`.slice(0, 160);
  const assignment = await createAssignment(user, {
    classId: prepared.curriculum.classId, title, instructions: prepared.activity.instructions, dueLocal: input.dueLocal,
    objectives: { curriculumId: prepared.record.id, curriculumVersion: prepared.record.version, outcomeIds: prepared.plan.outcomeIds },
    resourceIds: prepared.plan.resourceIds ?? [], ...(prepared.group ? { audienceStudentIds: prepared.group.studentIds } : {}),
    // The plan's checks for understanding become the marking criteria, one point each; the teacher can edit them before release.
    rubric: prepared.plan.checks.map((check, index) => ({ id: `check-${index + 1}`, title: check.question.trim().length >= 2 ? check.question.trim().slice(0, 120) : `Check ${index + 1}`, description: check.expectedEvidence.trim().slice(0, 500), maxPoints: 1 })),
  });
  await schoolAiTransaction(user, async tx => {
    const state = await tx.lessonPlanState.findFirst({ where: { curriculumId: input.curriculumId, planId: input.planId } });
    const published = [...((state?.publishedActivities ?? []) as Published[]), { activityIndex: input.activityIndex, groupId: input.groupId, assignmentId: assignment.id }];
    await saveState(tx, user, { campusId: prepared.campusId, curriculumId: input.curriculumId, planId: input.planId }, state, state?.version ?? 0, { publishedActivities: published }, "PUBLISHED_ACTIVITY", { activityIndex: input.activityIndex, group: prepared.group?.label ?? null, assignmentId: assignment.id });
  });
  return { assignmentId: assignment.id, duplicate: false, audience: prepared.group ? prepared.group.studentIds.length : "CLASS" };
}

const CopyInput = z.object({ curriculumId: z.string().min(1), planId: z.string().min(1), targetCurriculumId: z.string().min(1), targetVersion: z.number().int().positive() }).strict();
/** Copies content into another class's curriculum draft. Groups, delivery, dates and confirmation never travel. */
export async function copyLessonPlanToClass(user: AuthUser, raw: unknown) {
  const input = CopyInput.parse(raw);
  if (input.targetCurriculumId === input.curriculumId) throw new ApiError("Choose another class's curriculum.", 400);
  return schoolAiTransaction(user, async tx => {
    const { plan } = await load(user, input.curriculumId, input.planId, tx);
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    const target = await getWorkspaceRecordInTransaction(user, input.targetCurriculumId, tx, permissions);
    if (target.kind !== "CURRICULUM") throw new ApiError("Choose a curriculum.", 422);
    const data = curriculumDataSchema.parse(target.data);
    const missing = plan.outcomeIds.filter(id => !data.outcomes.some(o => o.id === id)).length + plan.sourceRefs.filter(ref => !data.sources.some(s => s.id === ref.sourceId)).length;
    if (missing) throw new ApiError("That class's curriculum does not contain the outcomes and sources this plan uses. Map them there first.", 409);
    const copy = copyLessonPlan(plan, user.userId, randomUUID());
    const { resourceIds: _resources, ...portable } = copy; // resources belong to the original class
    const saved = await updateWorkspaceRecordInTransaction(user, target.id, { version: input.targetVersion, data: { ...data, lessonPlans: [...(data.lessonPlans ?? []), portable] } }, tx, permissions);
    return { curriculumId: saved.id, version: saved.version, planId: copy.id };
  });
}
