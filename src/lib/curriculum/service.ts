import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { getWorkspaceRecordInTransaction } from "@/lib/school-ai/repository";
import { assertSchoolAiAccess, assertWorkspacePermission, assertWorkspaceSubject, getAssignedWorkspaceSubjects, isSchoolAiManager, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus } from "@/lib/school-ai/access";
import { curriculumDataSchema, objectiveStructureIssues, paperDataSchema, type CurriculumData } from "@/lib/school-ai/assessment";
import { compareVersions, objectiveCoverage, unmappedWork, versionImpact, type PaperRef, type ReleaseRef, type ResourceRef } from "./objective-map";

// SKO-406: the objective map reads the school's own approved curriculum versions. Leads record
// cross-curriculum mapping decisions; teachers read coverage and link resources they author.

export const MAPPING_RELATIONS = ["SAME", "PARTIAL", "NOT_EQUIVALENT"] as const;

async function curriculumAt(tx: TxClient, user: AuthUser, recordId: string, version: number, current: { version: number; data: unknown }): Promise<CurriculumData | null> {
  if (version === current.version) return curriculumDataSchema.parse(current.data);
  const row = await tx.schoolAiRevision.findFirst({ where: { schoolId: user.schoolId, recordId, version }, select: { data: true } });
  const parsed = row ? curriculumDataSchema.safeParse(row.data) : null;
  return parsed?.success ? parsed.data : null;
}

/** SKO-427: code and title of objectives in one curriculum version (empty when the version is gone). */
export async function objectiveLabels(tx: TxClient, user: AuthUser, curriculumId: string, version: number, outcomeIds: string[]) {
  const record = await tx.schoolAiRecord.findFirst({ where: { id: curriculumId, schoolId: user.schoolId, kind: "CURRICULUM" }, select: { version: true, data: true } });
  const data = record ? await curriculumAt(tx, user, curriculumId, version, record) : null;
  return (data?.outcomes ?? []).filter(o => outcomeIds.includes(o.id)).map(o => ({ id: o.id, code: o.code, title: o.title }));
}

async function openCurriculum(tx: TxClient, user: AuthUser, recordId: string) {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  await assertWorkspacePermission(user, "exams", "view", permissions);
  const record = await getWorkspaceRecordInTransaction(user, recordId, tx, permissions);
  if (record.kind !== "CURRICULUM" || !record.campusId) throw new ApiError("Choose a curriculum.", 422);
  await assertWorkspaceSubject(user, record.campusId, record.data as Record<string, unknown>, tx);
  return { record, curriculum: curriculumDataSchema.parse(record.data), permissions };
}

/** Approved curricula the actor may open: managers see their campus, teachers their assigned subjects. */
export async function listCurricula(user: AuthUser) {
  return schoolAiTransaction(user, async tx => {
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    await assertSchoolAiAccess(user, "view", permissions);
    await assertWorkspacePermission(user, "exams", "view", permissions);
    const campusId = await resolveWorkspaceCampus(user, undefined, tx);
    const subjects = await getAssignedWorkspaceSubjects(user, tx);
    const rows = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, kind: "CURRICULUM", status: "APPROVED", ...(campusId ? { campusId } : {}), subjectId: { in: subjects.map(subject => subject.id) } }, select: { id: true, title: true, version: true, subjectId: true, classId: true }, orderBy: { title: "asc" }, take: 200 });
    return rows.map(row => { const subject = subjects.find(item => item.id === row.subjectId); return { ...row, subject: subject?.name ?? "", className: subject ? `${subject.class.name}${subject.class.section ? ` ${subject.class.section}` : ""}` : "" }; });
  });
}

export const mapInput = z.object({ recordId: z.string().min(1), compareTo: z.coerce.number().int().positive().optional() }).strict();

export async function objectiveMap(user: AuthUser, raw: unknown) {
  const input = mapInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { record, curriculum } = await openCurriculum(tx, user, input.recordId);
    const campusId = record.campusId!;
    const versions = await tx.schoolAiRevision.findMany({ where: { schoolId: user.schoolId, recordId: record.id }, select: { version: true, status: true, createdAt: true }, orderBy: { version: "desc" }, take: 50 });
    const baseline = input.compareTo ?? versions.find(row => row.version < record.version && row.status === "APPROVED")?.version;
    const previous = baseline && baseline !== record.version ? await curriculumAt(tx, user, record.id, baseline, record) : null;

    const paperRows = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId, kind: "PAPER", subjectId: curriculum.subjectId, classId: curriculum.classId, ...(isSchoolAiManager(user) ? {} : { createdById: user.userId }) }, select: { id: true, title: true, version: true, status: true, data: true }, take: 500 });
    const papers: PaperRef[] = paperRows.flatMap(row => { const data = paperDataSchema.safeParse(row.data); return data.success && data.data.curriculumId === record.id ? [{ id: row.id, title: row.title, version: row.version, status: row.status, data: data.data }] : []; });
    const releaseRows = await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, campusId, classId: curriculum.classId, status: { not: "DRAFT" }, AND: [{ paperSnapshot: { path: ["curriculumId"], equals: record.id } }] }, select: { id: true, paperId: true, paperVersion: true, paperSnapshot: true }, take: 500 });
    const releases: ReleaseRef[] = releaseRows.flatMap(row => { const snapshot = paperDataSchema.safeParse(row.paperSnapshot); return snapshot.success ? [{ id: row.id, paperId: row.paperId, paperVersion: row.paperVersion, snapshot: snapshot.data }] : []; });
    const resourceRows = await tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId: curriculum.classId }, select: { id: true, title: true, status: true, objectives: true }, take: 500 });
    const resources: ResourceRef[] = resourceRows.map(row => ({ ...row, objectives: row.objectives as ResourceRef["objectives"] }));
    const topics = await tx.syllabusTopic.findMany({ where: { schoolId: user.schoolId, subjectId: curriculum.subjectId }, select: { id: true, title: true, description: true, status: true }, orderBy: { order: "asc" } });
    const mappings = await tx.curriculumObjectiveMapping.findMany({ where: { schoolId: user.schoolId, OR: [{ fromRecordId: record.id, fromVersion: record.version }, { toRecordId: record.id, toVersion: record.version }] }, orderBy: { createdAt: "desc" } });
    const others = isSchoolAiManager(user) ? await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId, kind: "CURRICULUM", status: "APPROVED", id: { not: record.id } }, select: { id: true, title: true, version: true, data: true }, take: 50 }) : [];
    const changes = previous ? compareVersions(previous, curriculum) : [];

    return {
      record: { id: record.id, title: record.title, version: record.version, status: record.status },
      pack: { board: curriculum.board, academicYear: curriculum.academicYear, ...curriculum.pack, sources: curriculum.sources.map(({ id, title, kind, edition, approved }) => ({ id, title, kind, edition, approved })) },
      objectives: curriculum.outcomes.map(({ id, code, title, description, prerequisiteIds, sourceId, sourcePage, taught, included }) => ({ id, code, title, description, prerequisiteIds: prerequisiteIds ?? [], sourceId, sourcePage, taught, included })),
      structureIssues: objectiveStructureIssues(curriculum),
      coverage: objectiveCoverage(record.id, curriculum, record.version, { topics, releases, papers, resources }),
      unmapped: unmappedWork(record.id, curriculum, { papers, resources }),
      versions: versions.map(row => ({ version: row.version, status: row.status, createdAt: row.createdAt })),
      comparison: previous ? { from: baseline!, to: record.version, changes, impact: versionImpact(record.id, changes, record.version, papers, releases) } : null,
      // Latest decision per pair is current; earlier decisions stay as history.
      mappings: mappings.filter((row, index) => mappings.findIndex(other => other.fromRecordId === row.fromRecordId && other.fromVersion === row.fromVersion && other.fromOutcomeId === row.fromOutcomeId && other.toRecordId === row.toRecordId && other.toVersion === row.toVersion && other.toOutcomeId === row.toOutcomeId) === index),
      mappingTargets: others.flatMap(row => { const data = curriculumDataSchema.safeParse(row.data); return data.success ? [{ id: row.id, title: row.title, version: row.version, board: data.data.board, objectives: data.data.outcomes.map(({ id, code, title }) => ({ id, code, title })) }] : []; }),
      canDecide: isSchoolAiManager(user),
    };
  });
}

const endpoint = z.object({ recordId: z.string().min(1), version: z.number().int().positive(), outcomeId: z.string().min(1).max(120) }).strict();
export const mappingInput = z.object({ from: endpoint, to: endpoint, relation: z.enum(MAPPING_RELATIONS), note: z.string().trim().max(500).default("") }).strict();

/** A reviewed decision relating two objectives in different curriculum versions. */
export async function recordMapping(user: AuthUser, raw: unknown) {
  const input = mappingInput.parse(raw);
  if (!isSchoolAiManager(user)) throw new ApiError("Only a curriculum lead can decide how objectives relate.", 403);
  if (input.from.recordId === input.to.recordId && input.from.version === input.to.version) throw new ApiError("Choose objectives from two different curriculum versions.", 400);
  return schoolAiTransaction(user, async tx => {
    const resolve = async (side: z.infer<typeof endpoint>) => {
      const { record } = await openCurriculum(tx, user, side.recordId);
      const data = await curriculumAt(tx, user, record.id, side.version, record);
      if (!data?.outcomes.some(outcome => outcome.id === side.outcomeId)) throw new ApiError("That objective is not in the chosen curriculum version.", 400);
      return record;
    };
    const from = await resolve(input.from); await resolve(input.to);
    const row = await tx.curriculumObjectiveMapping.create({ data: { schoolId: user.schoolId, campusId: from.campusId!, fromRecordId: input.from.recordId, fromVersion: input.from.version, fromOutcomeId: input.from.outcomeId, toRecordId: input.to.recordId, toVersion: input.to.version, toOutcomeId: input.to.outcomeId, relation: input.relation, note: input.note, decidedById: user.userId } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: from.campusId, tableName: "curriculum_objective_mappings", recordId: row.id, userId: user.userId, newValue: { relation: input.relation, from: input.from, to: input.to } } });
    return row;
  });
}

/** Validates a resource's objective links against the exact saved curriculum version. */
export async function assertObjectivesExist(tx: TxClient, user: AuthUser, classId: string, objectives: { curriculumId: string; curriculumVersion: number; outcomeIds: string[] }) {
  const record = await tx.schoolAiRecord.findFirst({ where: { id: objectives.curriculumId, schoolId: user.schoolId, kind: "CURRICULUM" }, select: { id: true, version: true, data: true, status: true } });
  const data = record ? await curriculumAt(tx, user, record.id, objectives.curriculumVersion, record) : null;
  if (!record || !data || data.classId !== classId) throw new ApiError("Choose a curriculum version for this class.", 400);
  if (new Set(objectives.outcomeIds).size !== objectives.outcomeIds.length || objectives.outcomeIds.some(id => !data.outcomes.some(outcome => outcome.id === id))) throw new ApiError("Choose distinct objectives from that curriculum version.", 400);
}
