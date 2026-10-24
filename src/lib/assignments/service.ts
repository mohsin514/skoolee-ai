import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { teacherClassIds } from "@/lib/chat/policy";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { createPrivateUploadUrl, MAX_PRIVATE_UPLOAD_BYTES } from "@/lib/storage/private-upload";
import { readPrivateObject } from "@/lib/storage/s3";
import { assertObjectivesExist } from "@/lib/curriculum/service";
import { getLocalePackage } from "@/lib/locale/store";
import {
  allowedContentTypes, artifactChecksum, effectiveDue, FILE_TYPE_GROUPS, isLate, LOCAL_DATETIME, localToInstant, receiptCode,
  rubricIssues, rubricSchema, rubricTotal, sameRubric, scoreIssues, scoreSchema, scoreTotal, sha256, SUBMISSION_FILE_TYPES, type Criterion, type Score,
} from "./rules";

// SKO-409 assignments, submissions and rubrics. The assignment row is the teacher's editable
// draft; a release freezes instructions, rubric, audience and deadline into an immutable
// version. Learners reach only released work addressed to them; every other assignment,
// submission or file answers with the same 404. Feedback stays private until returned and is
// formative only: a gradebook transfer is an explicit request, never applied here.

type Assignment = Prisma.AssignmentGetPayload<object>;
type Release = Prisma.AssignmentVersionGetPayload<object>;
const notFound = () => new ApiError("Assignment not found.", 404);
const audit = (tx: TxClient, user: AuthUser, assignment: { id: string; campusId: string }, newValue: Prisma.InputJsonValue, oldValue?: Prisma.InputJsonValue) =>
  tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, tableName: "assignments", recordId: assignment.id, userId: user.userId, newValue, ...(oldValue ? { oldValue } : {}) } });

// ─── Scope ────────────────────────────────────────────────────────
async function authorClassIds(tx: TxClient, user: AuthUser): Promise<string[] | "campus"> {
  if (canManageOperations(user)) return "campus";
  if (user.role === "TEACHER") return teacherClassIds(user.userId, tx);
  return [];
}
async function canAuthor(tx: TxClient, user: AuthUser, klass: { id: string; campusId: string }) {
  const scope = await authorClassIds(tx, user);
  return scope === "campus" ? (user.role === "SUPER_ADMIN" || klass.campusId === user.campusId) : scope.includes(klass.id);
}
async function assertAuthor(tx: TxClient, user: AuthUser, classId: string) {
  const klass = await tx.class.findFirst({ where: { id: classId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true } });
  if (!klass) throw new ApiError("Class not found.", 404);
  if (!(await canAuthor(tx, user, klass))) throw new ApiError("You cannot set work for this class.", 403);
  return klass;
}
/** Staff who cannot author the class get the same 404 as a missing assignment. */
async function authorAssignment(tx: TxClient, user: AuthUser, assignmentId: string) {
  if (user.role === "STUDENT" || user.role === "PARENT") throw notFound();
  const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId } });
  if (!assignment || !(await canAuthor(tx, user, { id: assignment.classId, campusId: assignment.campusId }))) throw notFound();
  return assignment;
}
const currentRelease = (tx: TxClient, user: AuthUser, assignment: Assignment) => assignment.currentVersion
  ? tx.assignmentVersion.findFirst({ where: { schoolId: user.schoolId, assignmentId: assignment.id, version: assignment.currentVersion } })
  : Promise.resolve(null);

type LearnerAccess = { assignment: Assignment; release: Release; student: { id: string; classId: string; archivedAt: Date | null; fullName: string }; canSubmit: boolean };
/**
 * A learner may open released, opened work addressed to them, and keep reading work they took
 * part in after leaving the class. Only a currently enrolled recipient may submit.
 */
async function learnerAccess(tx: TxClient, user: AuthUser, assignmentId: string, now: Date, studentId?: string): Promise<LearnerAccess> {
  const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, status: { not: "DRAFT" } } });
  if (!assignment) throw notFound();
  const release = await currentRelease(tx, user, assignment);
  if (!release || release.opensAt > now) throw notFound();
  const students = await learnerStudents(tx, user);
  const candidates = studentId ? students.filter(s => s.id === studentId) : students;
  const withWork = await tx.assignmentSubmission.findMany({ where: { schoolId: user.schoolId, assignmentId, studentId: { in: candidates.map(s => s.id) }, latestVersion: { gt: 0 } }, select: { studentId: true } });
  const student = candidates.find(s => release.audience.includes(s.id)) ?? candidates.find(s => withWork.some(w => w.studentId === s.id));
  if (!student) throw notFound();
  const canSubmit = user.role === "STUDENT" && assignment.status === "RELEASED" && release.audience.includes(student.id) && student.classId === assignment.classId && !student.archivedAt;
  return { assignment, release, student, canSubmit };
}
async function learnerStudents(tx: TxClient, user: AuthUser) {
  if (user.role === "STUDENT") return tx.student.findMany({ where: { schoolId: user.schoolId, studentUserId: user.userId }, select: { id: true, classId: true, archivedAt: true, fullName: true } });
  if (user.role === "PARENT") return tx.student.findMany({ where: { AND: [studentScope(user, "learningRecords"), { archivedAt: null }] }, select: { id: true, classId: true, archivedAt: true, fullName: true } });
  return [];
}

// ─── Views ────────────────────────────────────────────────────────
const parseRubric = (value: unknown) => rubricSchema.parse(value);
type VersionRow = Prisma.AssignmentSubmissionVersionGetPayload<{ include: { feedback: true } }>;
const receiptView = (row: VersionRow) => ({
  id: row.id, version: row.version, receiptCode: row.receiptCode, mode: row.mode, submittedAt: row.submittedAt, receivedAt: row.receivedAt, late: row.late,
  effectiveDueAt: row.effectiveDueAt, assignmentVersion: row.assignmentVersion, rubricVersion: row.rubricVersion, text: row.text,
  file: row.storageKey ? { name: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes, sha256: row.fileSha256 } : null,
  artifactSha256: row.artifactSha256, draftSavedAt: row.draftSavedAt,
});
/** Learners and families only ever see returned feedback; drafts and the gradebook request stay with staff. */
const returnedFeedback = (row: VersionRow) => row.feedback?.status === "RETURNED"
  ? { criteria: row.feedback.criteria as Score[], comment: row.feedback.comment, totalPoints: row.feedback.totalPoints, returnedAt: row.feedback.returnedAt, rubricVersion: row.feedback.rubricVersion }
  : null;
const staffFeedback = (row: VersionRow) => row.feedback ? { ...returnedFeedback(row), status: row.feedback.status, criteria: row.feedback.criteria as Score[], comment: row.feedback.comment, totalPoints: row.feedback.totalPoints, gradebookTransfer: row.feedback.gradebookTransfer } : null;

async function rubricsOf(tx: TxClient, user: AuthUser, assignmentId: string) {
  const rows = await tx.assignmentRubricVersion.findMany({ where: { schoolId: user.schoolId, assignmentId }, orderBy: { version: "asc" } });
  return rows.map(row => ({ version: row.version, criteria: parseRubric(row.criteria), totalPoints: row.totalPoints, createdAt: row.createdAt }));
}
async function resourcesOf(tx: TxClient, user: AuthUser, classId: string, ids: string[]) {
  if (!ids.length) return [];
  return tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId, id: { in: ids }, status: "PUBLISHED", audience: { in: ["CLASS", "CLASS_AND_GUARDIANS"] } }, select: { id: true, title: true } });
}

/** The learner's derived state in plain language: Open, Draft, Submitted, Returned, Revision open or Closed. */
function learnerState(submission: { status: string; latestVersion: number; draftSavedAt: Date | null; draftUploadedAt: Date | null } | null, assignmentStatus: string) {
  if (!submission || (submission.latestVersion === 0 && !submission.draftSavedAt && !submission.draftUploadedAt)) return assignmentStatus === "CLOSED" ? "CLOSED" : "OPEN";
  if (submission.latestVersion === 0) return "DRAFT";
  return submission.status;
}

async function learnerView(tx: TxClient, user: AuthUser, access: LearnerAccess, now: Date) {
  const { assignment, release, student } = access;
  const [rubrics, extensions, submission, resources] = await Promise.all([
    rubricsOf(tx, user, assignment.id),
    tx.assignmentExtension.findMany({ where: { schoolId: user.schoolId, assignmentId: assignment.id, studentId: student.id }, orderBy: { createdAt: "desc" } }),
    tx.assignmentSubmission.findFirst({ where: { schoolId: user.schoolId, assignmentId: assignment.id, studentId: student.id }, include: { versions: { include: { feedback: true }, orderBy: { version: "desc" } } } }),
    resourcesOf(tx, user, assignment.classId, release.resourceIds),
  ]);
  const rubric = rubrics.find(r => r.version === release.rubricVersion);
  const due = effectiveDue(release.dueAt, extensions);
  const latest = submission?.versions[0];
  const latestReturned = latest?.feedback?.status === "RETURNED";
  const state = learnerState(submission ?? null, assignment.status);
  const openForWork = access.canSubmit && release.submissionMode !== "PAPER" && (!latest || state === "REOPENED" || (state === "SUBMITTED" && !latestReturned && now <= due));
  const refusedLate = release.latePolicy === "REFUSE" && now > due && state !== "REOPENED";
  return {
    id: assignment.id, title: release.title, instructions: release.instructions, version: release.version, studentId: student.id, studentName: student.fullName,
    rubric: rubric ? { version: rubric.version, criteria: rubric.criteria, totalPoints: rubric.totalPoints } : null,
    timezone: release.timezone, opensAt: release.opensAt, dueAt: release.dueAt, dueLocal: release.dueLocal, effectiveDueAt: due,
    extension: extensions[0] ? { dueLocal: extensions[0].dueLocal, dueAt: extensions[0].dueAt, reason: extensions[0].reason } : null,
    submissionMode: release.submissionMode, allowedTypes: release.allowedTypes, latePolicy: release.latePolicy, resubmission: release.resubmission,
    resources, state, overdue: now > due, enrolled: access.canSubmit || (student.classId === assignment.classId && !student.archivedAt),
    canSubmit: openForWork && !refusedLate, canEditDraft: openForWork,
    draft: user.role === "STUDENT" && submission ? {
      text: submission.draftText, savedAt: submission.draftSavedAt,
      file: submission.draftStorageKey ? { name: submission.draftFileName, sizeBytes: submission.draftSizeBytes, contentType: submission.draftContentType, ready: !!submission.draftUploadedAt, sha256: submission.draftSha256 } : null,
    } : null,
    versions: (submission?.versions ?? []).map(row => ({ ...receiptView(row), ...(user.role === "PARENT" ? { text: "", file: row.storageKey ? { name: row.fileName, contentType: null, sizeBytes: null, sha256: null } : null } : {}), feedback: returnedFeedback(row), rubric: rubrics.find(r => r.version === row.rubricVersion)?.criteria ?? [] })),
  };
}

// ─── Reading ──────────────────────────────────────────────────────
export const listInput = z.object({ classId: z.string().min(1).optional() }).strict();

export async function listAssignments(user: AuthUser, raw: unknown, now = new Date()) {
  const input = listInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    if (user.role === "STUDENT" || user.role === "PARENT") {
      const students = await learnerStudents(tx, user);
      const subs = await tx.assignmentSubmission.findMany({ where: { schoolId: user.schoolId, studentId: { in: students.map(s => s.id) }, latestVersion: { gt: 0 } }, select: { assignmentId: true } });
      const rows = await tx.assignment.findMany({ where: { schoolId: user.schoolId, status: { not: "DRAFT" }, OR: [{ classId: { in: students.map(s => s.classId) } }, { id: { in: subs.map(s => s.assignmentId) } }] }, orderBy: { updatedAt: "desc" }, take: 200 });
      const items = [];
      for (const row of rows) for (const student of students) {
        const access = await learnerAccess(tx, user, row.id, now, student.id).catch(() => null);
        if (access) items.push(await learnerView(tx, user, access, now));
      }
      items.sort((a, b) => new Date(a.effectiveDueAt).getTime() - new Date(b.effectiveDueAt).getTime());
      return { mode: user.role === "PARENT" ? "guardian" as const : "learner" as const, assignments: items };
    }
    const scope = await authorClassIds(tx, user);
    const classes = await tx.class.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(scope === "campus" ? (user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) : { id: { in: scope } }) }, select: { id: true, name: true, section: true }, orderBy: [{ name: "asc" }] });
    if (!classes.length) throw new ApiError("You have no classes to set work for.", 403);
    if (input.classId && !classes.some(c => c.id === input.classId)) throw new ApiError("You cannot set work for this class.", 403);
    const classId = input.classId ?? classes[0].id;
    const [rows, subjects] = await Promise.all([
      tx.assignment.findMany({ where: { schoolId: user.schoolId, classId }, orderBy: { updatedAt: "desc" }, take: 200 }),
      tx.subject.findMany({ where: { schoolId: user.schoolId, classId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const releases = await tx.assignmentVersion.findMany({ where: { schoolId: user.schoolId, assignmentId: { in: rows.map(r => r.id) } }, select: { assignmentId: true, version: true, dueAt: true, dueLocal: true, timezone: true, audience: true, rubricVersion: true } });
    const submissions = await tx.assignmentSubmission.findMany({ where: { schoolId: user.schoolId, assignmentId: { in: rows.map(r => r.id) }, latestVersion: { gt: 0 } }, include: { versions: { include: { feedback: { select: { status: true } } }, orderBy: { version: "desc" }, take: 1 } } });
    return {
      mode: "staff" as const, classId, classes, subjects,
      assignments: rows.map(row => {
        const release = releases.find(r => r.assignmentId === row.id && r.version === row.currentVersion);
        const mine = submissions.filter(s => s.assignmentId === row.id);
        return {
          id: row.id, title: row.title, status: row.status, currentVersion: row.currentVersion, dueLocal: release?.dueLocal ?? row.dueLocal, dueAt: release?.dueAt ?? null, timezone: release?.timezone ?? null,
          rubricVersion: release?.rubricVersion ?? null, recipients: release?.audience.length ?? 0, updatedAt: row.updatedAt,
          counts: {
            submitted: mine.length,
            needsFeedback: mine.filter(s => s.status === "SUBMITTED" && s.versions[0]?.feedback?.status !== "RETURNED").length,
            late: mine.filter(s => s.versions[0]?.late).length,
            returned: mine.filter(s => s.status === "RETURNED" || s.status === "REOPENED").length,
          },
        };
      }),
    };
  });
}

export async function getAssignment(user: AuthUser, assignmentId: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    if (user.role === "STUDENT" || user.role === "PARENT") return { mode: "learner" as const, assignment: await learnerView(tx, user, await learnerAccess(tx, user, assignmentId, now), now) };
    const assignment = await authorAssignment(tx, user, assignmentId);
    const release = await currentRelease(tx, user, assignment);
    const [versions, rubrics, submissions, extensions, enrolled, resources] = await Promise.all([
      tx.assignmentVersion.findMany({ where: { schoolId: user.schoolId, assignmentId }, orderBy: { version: "desc" } }),
      rubricsOf(tx, user, assignmentId),
      tx.assignmentSubmission.findMany({ where: { schoolId: user.schoolId, assignmentId }, include: { versions: { include: { feedback: true }, orderBy: { version: "desc" } } } }),
      tx.assignmentExtension.findMany({ where: { schoolId: user.schoolId, assignmentId }, orderBy: { createdAt: "desc" } }),
      tx.student.findMany({ where: { schoolId: user.schoolId, classId: assignment.classId, archivedAt: null }, select: { id: true } }),
      tx.learningResource.findMany({ where: { schoolId: user.schoolId, classId: assignment.classId, status: "PUBLISHED", audience: { in: ["CLASS", "CLASS_AND_GUARDIANS"] } }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    ]);
    const learnerIds = [...new Set([...(release?.audience ?? []), ...submissions.map(s => s.studentId)])];
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: learnerIds } }, select: { id: true, fullName: true, rollNo: true, classId: true, archivedAt: true }, orderBy: { rollNo: "asc" } });
    const queue = students.map(student => {
      const submission = submissions.find(s => s.studentId === student.id);
      const mine = extensions.filter(e => e.studentId === student.id);
      return {
        studentId: student.id, name: student.fullName, rollNo: student.rollNo, enrolled: student.classId === assignment.classId && !student.archivedAt,
        inAudience: !!release?.audience.includes(student.id), status: learnerState(submission ?? null, assignment.status),
        effectiveDueAt: release ? effectiveDue(release.dueAt, mine) : null,
        extension: mine[0] ? { dueLocal: mine[0].dueLocal, reason: mine[0].reason, createdAt: mine[0].createdAt } : null,
        versions: (submission?.versions ?? []).map(row => ({ ...receiptView(row), feedback: staffFeedback(row) })),
      };
    });
    return {
      mode: "staff" as const,
      assignment: { ...assignment, rubric: parseRubric(assignment.rubric) },
      release: release ? { ...release } : null, versions, rubrics, queue, resources,
      // A group-targeted task is not expected to reach every new learner in the class.
      newLearners: assignment.audienceStudentIds?.length ? 0 : enrolled.filter(s => !release?.audience.includes(s.id)).length,
      fileTypeGroups: Object.keys(FILE_TYPE_GROUPS),
    };
  });
}

// ─── Authoring ────────────────────────────────────────────────────
const objectives = z.object({ curriculumId: z.string().min(1), curriculumVersion: z.number().int().positive(), outcomeIds: z.array(z.string().min(1).max(64)).max(30) }).strict();
const localTime = z.string().regex(LOCAL_DATETIME, "Use a date and time like 2026-10-20T23:59.");
const draftFields = {
  subjectId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().max(8000).default(""),
  submissionMode: z.enum(["ONLINE", "PAPER", "BOTH"]).default("ONLINE"),
  allowedTypes: z.array(z.enum(Object.keys(FILE_TYPE_GROUPS) as [string, ...string[]])).max(4).default([]),
  opensLocal: localTime.nullable().optional(),
  dueLocal: localTime.nullable().optional(),
  latePolicy: z.enum(["ACCEPT_FLAGGED", "REFUSE"]).default("ACCEPT_FLAGGED"),
  resubmission: z.enum(["NEVER", "AFTER_RETURN"]).default("AFTER_RETURN"),
  rubric: rubricSchema.default([]),
  objectives: objectives.nullable().optional(),
  resourceIds: z.array(z.string().min(1)).max(10).default([]),
  // SKO-414: optional learner subset (a lesson group). Omitted on update keeps the current audience.
  audienceStudentIds: z.array(z.string().min(1)).max(200).optional(),
  externalRef: z.string().regex(/^[a-z][a-z0-9-]{1,30}:[^\s]{1,120}$/, "Namespace external ids, e.g. classroom:12345.").nullable().optional(),
};
export const createInput = z.object({ classId: z.string().min(1), ...draftFields }).strict();
export const updateInput = z.object({ ...draftFields, expectedUpdatedAt: z.string().datetime() }).strict();

async function checkDraftLinks(tx: TxClient, user: AuthUser, classId: string, input: { subjectId?: string | null; objectives?: z.infer<typeof objectives> | null; resourceIds: string[]; audienceStudentIds?: string[] }) {
  if (input.audienceStudentIds?.length) {
    const ids = [...new Set(input.audienceStudentIds)];
    if (await tx.student.count({ where: { schoolId: user.schoolId, classId, archivedAt: null, id: { in: ids } } }) !== ids.length) throw new ApiError("A group may include only learners in this class.", 400);
  }
  if (input.subjectId && !(await tx.subject.findFirst({ where: { id: input.subjectId, schoolId: user.schoolId, classId }, select: { id: true } }))) throw new ApiError("Choose a subject of this class.", 400);
  if (input.objectives) await assertObjectivesExist(tx, user, classId, input.objectives);
  if ((await resourcesOf(tx, user, classId, input.resourceIds)).length !== new Set(input.resourceIds).size) throw new ApiError("Attach only published class resources.", 400);
}
const draftData = (input: z.infer<typeof updateInput> | z.infer<typeof createInput>) => ({
  subjectId: input.subjectId ?? null, title: input.title, instructions: input.instructions, submissionMode: input.submissionMode, allowedTypes: input.allowedTypes,
  opensLocal: input.opensLocal ?? null, dueLocal: input.dueLocal ?? null, latePolicy: input.latePolicy, resubmission: input.resubmission,
  rubric: input.rubric, objectives: input.objectives ?? Prisma.DbNull, resourceIds: [...new Set(input.resourceIds)], externalRef: input.externalRef ?? null,
  ...(input.audienceStudentIds ? { audienceStudentIds: [...new Set(input.audienceStudentIds)] } : {}),
});

export async function createAssignment(user: AuthUser, raw: unknown) {
  const input = createInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const klass = await assertAuthor(tx, user, input.classId);
    await checkDraftLinks(tx, user, klass.id, input);
    if (input.externalRef && await tx.assignment.findFirst({ where: { schoolId: user.schoolId, externalRef: input.externalRef }, select: { id: true } })) throw new ApiError("That external assignment is already imported.", 409);
    const assignment = await tx.assignment.create({ data: { schoolId: user.schoolId, campusId: klass.campusId, classId: klass.id, ownerId: user.userId, ...draftData(input) } });
    await audit(tx, user, assignment, { action: "CREATE", status: "DRAFT" });
    return assignment;
  });
}

/** Edits change only the draft. Released work keeps its frozen version until the next release. */
export async function updateAssignment(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = updateInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    if (assignment.status === "CLOSED") throw new ApiError("This assignment is closed.", 409);
    if (assignment.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new ApiError("Someone changed this assignment meanwhile. Refresh and try again.", 409);
    await checkDraftLinks(tx, user, assignment.classId, input);
    return tx.assignment.update({ where: { id: assignment.id }, data: draftData(input) });
  });
}

/** Everything a release would freeze, plus what blocks it and what it changes for existing work. */
async function planRelease(tx: TxClient, user: AuthUser, assignment: Assignment, now: Date) {
  const issues: string[] = [];
  const criteria = rubricSchema.safeParse(assignment.rubric);
  const rubric: Criterion[] = criteria.success ? criteria.data : [];
  if (!criteria.success) issues.push("The rubric is not valid.");
  issues.push(...rubricIssues(rubric));
  if (assignment.instructions.trim().length < 10) issues.push("Write instructions of at least 10 characters.");
  if (!assignment.dueLocal) issues.push("Choose a due date and time.");
  const { timezone } = await getLocalePackage(user.schoolId, assignment.campusId, now, null, tx);
  let dueAt: Date | null = null, opensAt = now;
  try {
    if (assignment.dueLocal) dueAt = localToInstant(assignment.dueLocal, timezone);
    if (assignment.opensLocal) opensAt = localToInstant(assignment.opensLocal, timezone);
  } catch (error) { issues.push(error instanceof Error ? error.message : "Choose a valid time."); }
  if (dueAt && dueAt <= opensAt) issues.push("The due time must be after the time the work opens.");
  if (dueAt && !assignment.currentVersion && dueAt <= now) issues.push("The due time has already passed.");
  const classRoster = await tx.student.findMany({ where: { schoolId: user.schoolId, classId: assignment.classId, archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } });
  // SKO-414: a group-targeted task releases only to group members still in the class.
  const subset = assignment.audienceStudentIds ?? [];
  const roster = subset.length ? classRoster.filter(s => subset.includes(s.id)) : classRoster;
  if (subset.length && roster.length !== new Set(subset).size) issues.push(`${new Set(subset).size - roster.length} learner(s) in this group are no longer in the class. Update the group in the lesson plan.`);
  if (!roster.length) issues.push("This class has no enrolled learners.");
  const lastRubric = await tx.assignmentRubricVersion.findFirst({ where: { schoolId: user.schoolId, assignmentId: assignment.id }, orderBy: { version: "desc" } });
  const rubricChanged = !lastRubric || !sameRubric(parseRubric(lastRubric.criteria), rubric);
  const earlierWork = assignment.currentVersion ? await tx.assignmentSubmissionVersion.count({ where: { schoolId: user.schoolId, assignmentId: assignment.id } }) : 0;
  return {
    issues, timezone, opensAt, dueAt, dueLocal: assignment.dueLocal, rubric, totalPoints: rubricTotal(rubric), roster,
    nextVersion: (assignment.currentVersion ?? 0) + 1, rubricVersion: rubricChanged ? (lastRubric?.version ?? 0) + 1 : lastRubric!.version, rubricChanged,
    // Existing submissions keep the version and rubric they were made under; this is shown before release.
    impact: { earlierSubmissions: earlierWork, keepsRubricVersion: lastRubric?.version ?? null },
    policy: { submissionMode: assignment.submissionMode, allowedTypes: assignment.allowedTypes, latePolicy: assignment.latePolicy, resubmission: assignment.resubmission },
  };
}

export async function previewRelease(user: AuthUser, assignmentId: string, now = new Date()) {
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    const plan = await planRelease(tx, user, assignment, now);
    return { ...plan, audience: plan.roster.map(s => ({ id: s.id, name: s.fullName, rollNo: s.rollNo })), roster: undefined };
  });
}

export const releaseInput = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
export async function releaseAssignment(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = releaseInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    if (assignment.status === "CLOSED") throw new ApiError("This assignment is closed.", 409);
    if ((assignment.currentVersion ?? 0) !== input.expectedVersion) throw new ApiError("This assignment was released meanwhile. Refresh and review again.", 409);
    if (assignment.objectives) await assertObjectivesExist(tx, user, assignment.classId, assignment.objectives as z.infer<typeof objectives>);
    const plan = await planRelease(tx, user, assignment, now);
    if (plan.issues.length) throw new ApiError(plan.issues.join(" "), 400);
    if (plan.rubricChanged) await tx.assignmentRubricVersion.create({ data: { schoolId: user.schoolId, assignmentId: assignment.id, version: plan.rubricVersion, criteria: plan.rubric, totalPoints: plan.totalPoints, createdById: user.userId } });
    const release = await tx.assignmentVersion.create({ data: {
      schoolId: user.schoolId, assignmentId: assignment.id, version: plan.nextVersion, title: assignment.title, instructions: assignment.instructions, rubricVersion: plan.rubricVersion,
      audience: plan.roster.map(s => s.id), submissionMode: assignment.submissionMode, allowedTypes: assignment.allowedTypes, timezone: plan.timezone, opensAt: plan.opensAt,
      dueAt: plan.dueAt!, dueLocal: plan.dueLocal!, latePolicy: assignment.latePolicy, resubmission: assignment.resubmission, objectives: assignment.objectives ?? Prisma.DbNull,
      resourceIds: assignment.resourceIds, releasedById: user.userId,
    } });
    await tx.assignment.update({ where: { id: assignment.id }, data: { status: "RELEASED", currentVersion: release.version } });
    await audit(tx, user, assignment, { action: "RELEASE", version: release.version, rubricVersion: plan.rubricVersion, audience: release.audience.length }, { status: assignment.status, version: assignment.currentVersion ?? 0 });
    return { version: release.version, rubricVersion: plan.rubricVersion, dueAt: release.dueAt, timezone: release.timezone, audience: release.audience.length, impact: plan.impact };
  });
}

export async function closeAssignment(user: AuthUser, assignmentId: string) {
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    if (assignment.status !== "RELEASED") throw new ApiError("Only released work can be closed.", 409);
    await audit(tx, user, assignment, { action: "CLOSE" }, { status: assignment.status });
    return tx.assignment.update({ where: { id: assignment.id }, data: { status: "CLOSED" } });
  });
}

async function recipient(tx: TxClient, user: AuthUser, assignment: Assignment, studentId: string) {
  const release = await currentRelease(tx, user, assignment);
  if (!release) throw new ApiError("Release this assignment first.", 409);
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId: user.schoolId }, select: { id: true, classId: true, archivedAt: true } });
  if (!student || !release.audience.includes(student.id)) throw new ApiError("This learner did not receive this assignment.", 400);
  return { release, student };
}

export const extensionInput = z.object({ studentId: z.string().min(1), dueLocal: localTime, reason: z.string().trim().min(3).max(500) }).strict();
/** An approved individual deadline in the school timezone. Append-only: the newest one is in force. */
export async function grantExtension(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = extensionInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    const { release } = await recipient(tx, user, assignment, input.studentId);
    const { timezone } = await getLocalePackage(user.schoolId, assignment.campusId, now, null, tx);
    let dueAt: Date;
    try { dueAt = localToInstant(input.dueLocal, timezone); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Choose a valid time.", 400); }
    if (dueAt <= release.dueAt) throw new ApiError("An extension must be later than the class deadline.", 400);
    const row = await tx.assignmentExtension.create({ data: { schoolId: user.schoolId, assignmentId: assignment.id, studentId: input.studentId, dueAt, dueLocal: input.dueLocal, timezone, reason: input.reason, grantedById: user.userId } });
    await audit(tx, user, assignment, { action: "EXTENSION", studentId: input.studentId, dueAt: dueAt.toISOString() });
    return row;
  });
}

// ─── Submissions ──────────────────────────────────────────────────
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,120}$/);
async function submissionRow(tx: TxClient, user: AuthUser, assignmentId: string, studentId: string) {
  return (await tx.assignmentSubmission.findFirst({ where: { schoolId: user.schoolId, assignmentId, studentId } }))
    ?? tx.assignmentSubmission.create({ data: { schoolId: user.schoolId, assignmentId, studentId } });
}
const receiptOf = (row: Prisma.AssignmentSubmissionVersionGetPayload<object>, replayed: boolean) => ({
  id: row.id, receiptCode: row.receiptCode, version: row.version, submittedAt: row.submittedAt, receivedAt: row.receivedAt, assignmentVersion: row.assignmentVersion,
  rubricVersion: row.rubricVersion, artifactSha256: row.artifactSha256, fileSha256: row.fileSha256, fileName: row.fileName, late: row.late, effectiveDueAt: row.effectiveDueAt, mode: row.mode, replayed,
});
async function createReceipt(tx: TxClient, user: AuthUser, submission: { id: string; latestVersion: number }, data: { assignmentId: string; studentId: string; release: Release; mode: "ONLINE" | "PAPER"; key: string; text: string; file: { storageKey: string; fileName: string | null; contentType: string | null; sizeBytes: number | null; sha256: string } | null; receivedAt: Date; due: Date; draftSavedAt: Date | null; now: Date }) {
  let code = receiptCode();
  while (await tx.assignmentSubmissionVersion.findFirst({ where: { schoolId: user.schoolId, receiptCode: code }, select: { id: true } })) code = receiptCode();
  const row = await tx.assignmentSubmissionVersion.create({ data: {
    schoolId: user.schoolId, submissionId: submission.id, assignmentId: data.assignmentId, studentId: data.studentId, version: submission.latestVersion + 1,
    assignmentVersion: data.release.version, rubricVersion: data.release.rubricVersion, mode: data.mode, idempotencyKey: data.key, receiptCode: code, text: data.text,
    storageKey: data.file?.storageKey ?? null, fileName: data.file?.fileName ?? null, contentType: data.file?.contentType ?? null, sizeBytes: data.file?.sizeBytes ?? null, fileSha256: data.file?.sha256 ?? null,
    artifactSha256: artifactChecksum(data.text, data.file?.sha256 ?? null), submittedAt: data.now, receivedAt: data.receivedAt, effectiveDueAt: data.due,
    late: isLate(data.receivedAt, data.due), draftSavedAt: data.draftSavedAt, recordedById: user.userId,
  } });
  await tx.assignmentSubmission.update({ where: { id: submission.id }, data: { status: "SUBMITTED", latestVersion: row.version } });
  return row;
}
/** A concurrent retry with the same key loses the unique race; replaying it returns the winner's receipt. */
async function onceByKey<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return work();
    throw error;
  }
}

export const draftInput = z.object({ text: z.string().max(20000) }).strict();
/** The server copy of a learner's draft. It is never a submission and never has a receipt. */
export async function saveDraft(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = draftInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const access = await learnerAccess(tx, user, assignmentId, now);
    if (!(await learnerView(tx, user, access, now)).canEditDraft) throw new ApiError("This work cannot be changed now.", 409);
    const submission = await submissionRow(tx, user, assignmentId, access.student.id);
    const row = await tx.assignmentSubmission.update({ where: { id: submission.id }, data: { draftText: input.text, draftSavedAt: now } });
    return { savedAt: row.draftSavedAt };
  });
}

export const fileInput = z.object({ fileName: z.string().trim().min(1).max(160), contentType: z.enum(SUBMISSION_FILE_TYPES), sizeBytes: z.number().int().positive().max(MAX_PRIVATE_UPLOAD_BYTES) }).strict();
/** Reserve a private key for the draft file. The bytes only count once confirmed and checksummed. */
export async function prepareDraftFile(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = fileInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const access = await learnerAccess(tx, user, assignmentId, now);
    if (!(await learnerView(tx, user, access, now)).canEditDraft) throw new ApiError("This work cannot be changed now.", 409);
    if (!allowedContentTypes(access.release.allowedTypes).includes(input.contentType)) throw new ApiError("This file type is not accepted for this assignment.", 400);
    const submission = await submissionRow(tx, user, assignmentId, access.student.id);
    const leaf = `${randomUUID()}-${input.fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file"}`;
    const storageKey = `submissions/${access.assignment.campusId}/${assignmentId}/${access.student.id}/${leaf}`;
    await tx.assignmentSubmission.update({ where: { id: submission.id }, data: { draftStorageKey: storageKey, draftFileName: input.fileName, draftContentType: input.contentType, draftSizeBytes: input.sizeBytes, draftSha256: null, draftUploadedAt: null, draftSavedAt: now } });
    return { uploadUrl: await createPrivateUploadUrl(user, { kind: "submission", targetId: submission.id, storageKey, contentType: input.contentType, sizeBytes: input.sizeBytes, fileName: input.fileName }) };
  });
}

/** After the browser's PUT: read the stored bytes back, check the size and record their checksum. */
export async function confirmDraftFile(user: AuthUser, assignmentId: string, read: typeof readPrivateObject = readPrivateObject, now = new Date()) {
  const pending = await schoolAiTransaction(user, async tx => {
    const access = await learnerAccess(tx, user, assignmentId, now);
    const submission = await tx.assignmentSubmission.findFirst({ where: { schoolId: user.schoolId, assignmentId, studentId: access.student.id } });
    if (!submission?.draftStorageKey) throw new ApiError("Choose a file first.", 409);
    return submission;
  });
  if (pending.draftUploadedAt) return { ready: true, sha256: pending.draftSha256 };
  let bytes: Uint8Array;
  try {
    const reader = (await read(pending.draftStorageKey!)).getReader(), chunks: Uint8Array[] = [];
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
    bytes = Buffer.concat(chunks);
  } catch { throw new ApiError("The file has not finished uploading. Your draft is kept; choose the file again.", 409); }
  if (bytes.byteLength !== pending.draftSizeBytes) throw new ApiError("The upload was incomplete. Your draft is kept; choose the file again.", 409);
  const digest = sha256(bytes);
  return schoolAiTransaction(user, async tx => {
    const updated = await tx.assignmentSubmission.updateMany({ where: { id: pending.id, schoolId: user.schoolId, draftStorageKey: pending.draftStorageKey, draftUploadedAt: null }, data: { draftUploadedAt: now, draftSha256: digest } });
    if (!updated.count) throw new ApiError("A different file was chosen meanwhile. Refresh and try again.", 409);
    return { ready: true, sha256: digest };
  });
}

export const submitInput = z.object({ idempotencyKey }).strict();
/**
 * Turn the server draft into a receipt. Repeating a request with the same key — a network
 * retry, a double tap — returns the original receipt and never adds a version.
 */
export async function submitWork(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = submitInput.parse(raw);
  return onceByKey(() => schoolAiTransaction(user, async tx => {
    const access = await learnerAccess(tx, user, assignmentId, now);
    const submission = await submissionRow(tx, user, assignmentId, access.student.id);
    const replay = await tx.assignmentSubmissionVersion.findFirst({ where: { schoolId: user.schoolId, submissionId: submission.id, idempotencyKey: input.idempotencyKey } });
    if (replay) return receiptOf(replay, true);
    const view = await learnerView(tx, user, access, now);
    if (!access.canSubmit) throw new ApiError("You can no longer submit this assignment.", 409);
    if (access.release.submissionMode === "PAPER") throw new ApiError("Hand this work in on paper; your teacher records it.", 409);
    if (!view.canEditDraft) throw new ApiError(view.state === "RETURNED" ? "Feedback was returned. Ask your teacher to reopen the work for a new version." : "This work cannot be submitted again now.", 409);
    if (!view.canSubmit) throw new ApiError("The deadline has passed and late work is not accepted.", 409);
    if (submission.draftStorageKey && !submission.draftUploadedAt) throw new ApiError("Your file has not finished uploading. Retry the upload before submitting.", 409);
    const text = submission.draftText.trim();
    const file = submission.draftStorageKey && submission.draftUploadedAt ? { storageKey: submission.draftStorageKey, fileName: submission.draftFileName, contentType: submission.draftContentType, sizeBytes: submission.draftSizeBytes, sha256: submission.draftSha256! } : null;
    if (!text && !file) throw new ApiError("Write an answer or attach a file before submitting.", 400);
    if (file && !allowedContentTypes(access.release.allowedTypes).includes(file.contentType ?? "")) throw new ApiError("This file type is not accepted for this assignment.", 400);
    const row = await createReceipt(tx, user, submission, { assignmentId, studentId: access.student.id, release: access.release, mode: "ONLINE", key: input.idempotencyKey, text, file, receivedAt: now, due: new Date(view.effectiveDueAt), draftSavedAt: submission.draftSavedAt, now });
    await audit(tx, user, access.assignment, { action: "SUBMIT", studentId: access.student.id, version: row.version, receipt: row.receiptCode, late: row.late });
    return receiptOf(row, false);
  }));
}

export const paperInput = z.object({ studentId: z.string().min(1), note: z.string().trim().min(3).max(2000), receivedLocal: localTime.nullable().optional(), idempotencyKey }).strict();
/** A teacher records work handed in on paper. Late status follows when it was received. */
export async function recordPaperSubmission(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = paperInput.parse(raw);
  return onceByKey(() => schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    const { release } = await recipient(tx, user, assignment, input.studentId);
    const submission = await submissionRow(tx, user, assignmentId, input.studentId);
    const replay = await tx.assignmentSubmissionVersion.findFirst({ where: { schoolId: user.schoolId, submissionId: submission.id, idempotencyKey: input.idempotencyKey } });
    if (replay) return receiptOf(replay, true);
    if (release.submissionMode === "ONLINE") throw new ApiError("This assignment accepts online work only.", 409);
    if (submission.status === "RETURNED") throw new ApiError("Feedback was returned. Reopen the work before recording a new version.", 409);
    let receivedAt = now;
    if (input.receivedLocal) {
      try { receivedAt = localToInstant(input.receivedLocal, release.timezone); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Choose a valid time.", 400); }
      if (receivedAt > now || receivedAt < release.opensAt) throw new ApiError("The received time must be between release and now.", 400);
    }
    const extensions = await tx.assignmentExtension.findMany({ where: { schoolId: user.schoolId, assignmentId, studentId: input.studentId } });
    const row = await createReceipt(tx, user, submission, { assignmentId, studentId: input.studentId, release, mode: "PAPER", key: input.idempotencyKey, text: input.note, file: null, receivedAt, due: effectiveDue(release.dueAt, extensions), draftSavedAt: null, now });
    await audit(tx, user, assignment, { action: "PAPER", studentId: input.studentId, version: row.version, receipt: row.receiptCode, late: row.late });
    return receiptOf(row, false);
  }));
}

// ─── Marking ──────────────────────────────────────────────────────
export const feedbackInput = z.object({
  submissionVersionId: z.string().min(1), scores: z.array(scoreSchema).max(20), comment: z.string().trim().max(4000).default(""),
  requestGradebookTransfer: z.boolean().default(false),
}).strict();
export const returnInput = feedbackInput.extend({ allowRevision: z.boolean().default(false) }).strict();

async function markable(tx: TxClient, user: AuthUser, assignmentId: string, submissionVersionId: string) {
  const assignment = await authorAssignment(tx, user, assignmentId);
  const version = await tx.assignmentSubmissionVersion.findFirst({ where: { id: submissionVersionId, schoolId: user.schoolId, assignmentId }, include: { feedback: true } });
  if (!version) throw new ApiError("Submission not found.", 404);
  if (version.feedback?.status === "RETURNED") throw new ApiError("Feedback for this version was already returned.", 409);
  const rubric = await tx.assignmentRubricVersion.findFirstOrThrow({ where: { schoolId: user.schoolId, assignmentId, version: version.rubricVersion } });
  return { assignment, version, criteria: parseRubric(rubric.criteria) };
}

/** A private marking draft against the submission's own rubric version. */
export async function saveFeedback(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = feedbackInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { version, criteria } = await markable(tx, user, assignmentId, input.submissionVersionId);
    const issues = scoreIssues(criteria, input.scores, false);
    if (issues.length) throw new ApiError(issues.join(" "), 400);
    const data = { criteria: input.scores, comment: input.comment, totalPoints: input.scores.some(s => s.points !== null) ? scoreTotal(input.scores) : null, gradebookTransfer: input.requestGradebookTransfer ? "REQUESTED" : "NOT_REQUESTED", markerId: user.userId };
    return tx.assignmentFeedback.upsert({ where: { submissionVersionId: version.id }, create: { schoolId: user.schoolId, submissionVersionId: version.id, rubricVersion: version.rubricVersion, ...data }, update: data });
  });
}

/** Return feedback to the learner (and their family). Optionally permit another version straight away. */
export async function returnFeedback(user: AuthUser, assignmentId: string, raw: unknown, now = new Date()) {
  const input = returnInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, version, criteria } = await markable(tx, user, assignmentId, input.submissionVersionId);
    const issues = scoreIssues(criteria, input.scores, true);
    if (issues.length) throw new ApiError(issues.join(" "), 400);
    const release = await tx.assignmentVersion.findFirstOrThrow({ where: { schoolId: user.schoolId, assignmentId, version: assignment.currentVersion! } });
    if (input.allowRevision && release.resubmission === "NEVER") throw new ApiError("This assignment does not allow another version.", 409);
    const data = { criteria: input.scores, comment: input.comment, totalPoints: scoreTotal(input.scores), status: "RETURNED", returnedAt: now, gradebookTransfer: input.requestGradebookTransfer ? "REQUESTED" : "NOT_REQUESTED", markerId: user.userId };
    const feedback = await tx.assignmentFeedback.upsert({ where: { submissionVersionId: version.id }, create: { schoolId: user.schoolId, submissionVersionId: version.id, rubricVersion: version.rubricVersion, ...data }, update: data });
    const submission = await tx.assignmentSubmission.findFirstOrThrow({ where: { id: version.submissionId, schoolId: user.schoolId } });
    if (submission.latestVersion === version.version) await tx.assignmentSubmission.update({ where: { id: submission.id }, data: { status: input.allowRevision ? "REOPENED" : "RETURNED" } });
    await audit(tx, user, assignment, { action: "RETURN", studentId: version.studentId, version: version.version, total: feedback.totalPoints ?? 0, reopened: input.allowRevision, gradebookTransfer: feedback.gradebookTransfer });
    return feedback;
  });
}

export const reopenInput = z.object({ studentId: z.string().min(1) }).strict();
/** Permit another version after feedback was returned. Earlier versions and feedback stay. */
export async function reopenSubmission(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = reopenInput.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const assignment = await authorAssignment(tx, user, assignmentId);
    const { release } = await recipient(tx, user, assignment, input.studentId);
    if (release.resubmission === "NEVER") throw new ApiError("This assignment does not allow another version.", 409);
    const submission = await tx.assignmentSubmission.findFirst({ where: { schoolId: user.schoolId, assignmentId, studentId: input.studentId } });
    if (submission?.status !== "RETURNED") throw new ApiError("Only returned work can be reopened.", 409);
    await audit(tx, user, assignment, { action: "REOPEN", studentId: input.studentId });
    return tx.assignmentSubmission.update({ where: { id: submission.id }, data: { status: "REOPENED" } });
  });
}

// ─── Files ────────────────────────────────────────────────────────
/** Staff of the class and the learner who submitted it; everyone else, including families, gets 404. */
export async function resolveSubmissionFile(user: AuthUser, assignmentId: string, submissionVersionId: string) {
  return schoolAiTransaction(user, async tx => {
    const row = await tx.assignmentSubmissionVersion.findFirst({ where: { id: submissionVersionId, schoolId: user.schoolId, assignmentId } });
    if (!row?.storageKey) throw notFound();
    const assignment = await tx.assignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId } });
    if (!assignment) throw notFound();
    if (user.role === "STUDENT") {
      if (!(await tx.student.findFirst({ where: { id: row.studentId, schoolId: user.schoolId, studentUserId: user.userId }, select: { id: true } }))) throw notFound();
    } else if (user.role === "PARENT" || !(await canAuthor(tx, user, { id: assignment.classId, campusId: assignment.campusId }))) throw notFound();
    await audit(tx, user, assignment, { action: "DOWNLOAD", submissionVersionId: row.id });
    return { storageKey: row.storageKey, fileName: row.fileName ?? "submission", contentType: row.contentType ?? "application/octet-stream" };
  });
}

/** Private-upload hook: only the learner's own reserved, not-yet-uploaded draft key. */
export async function assertSubmissionUploadTarget(tx: TxClient, user: AuthUser, submissionId: string, storageKey: string) {
  const denied = () => new ApiError("This upload is unavailable.", 403);
  if (user.role !== "STUDENT") throw denied();
  const submission = await tx.assignmentSubmission.findFirst({ where: { id: submissionId, schoolId: user.schoolId, draftStorageKey: storageKey, draftUploadedAt: null } });
  if (!submission) throw denied();
  const owner = await tx.student.findFirst({ where: { id: submission.studentId, schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true } });
  const assignment = await tx.assignment.findFirst({ where: { id: submission.assignmentId, schoolId: user.schoolId, status: "RELEASED" }, select: { campusId: true } });
  const parts = storageKey.split("/");
  if (!owner || !assignment || parts.length !== 5 || parts[0] !== "submissions" || parts[1] !== assignment.campusId || parts[2] !== submission.assignmentId || parts[3] !== submission.studentId || !parts[4] || /[\\\x00-\x1f]/.test(storageKey)) throw denied();
}
