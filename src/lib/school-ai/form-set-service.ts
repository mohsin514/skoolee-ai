import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { SchoolAiError, assertSchoolAiAccess, loadWorkspacePermissionSnapshot } from "./access";
import { paperDataSchema, type AssessmentLocale, type PaperData } from "./assessment";
import { FORM_LABELS, allocateForms, blueprintHashFor, compareLanguageVersions, formSetReleaseBlockers, itemGroupIdFor, type FormLabel, type FormSetMember } from "./form-set";
import { createSchoolAiExam } from "./exam-service";
import { contentHash } from "./release";
import { getWorkspaceRecordInTransaction, resolveScopeDeliveryPolicy } from "./repository";
import { assertStudioAction, recordStudioAction } from "./studio-access";
import { schoolAiTransaction } from "./transaction";

// SKO-408 R10: parallel forms. A saved paper becomes form A; each further form starts as an
// independent draft with its own item identities, so "shared" means deliberately the same item and
// never an unedited copy. Parity is structural only — the report never claims equal difficulty
// (FORM_DIFFICULTY_EVIDENCE is NOT_MEASURED). Assigning the set allocates each candidate to exactly
// one form before anyone starts, seals every form and records each item's exposure.

const json = (value: unknown) => value as Prisma.InputJsonValue;
/** A stable UUID per (set request, form), so a retried assignment replays each form's exam instead of duplicating it. */
const derivedUuid = (seed: string) => { const hex = createHash("sha256").update(seed).digest("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const itemText = (question: PaperData["questions"][number]) => normalize([question.prompt, ...question.options.map(option => option.text)].join(" | "));

async function loadSet(tx: TxClient, user: AuthUser, formSetId: string) {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  const set = await tx.schoolAiExamFormSet.findFirst({ where: { id: formSetId, schoolId: user.schoolId } });
  if (!set) throw new SchoolAiError("Form set unavailable.", 404);
  const rows = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId: set.campusId, kind: "PAPER", status: { not: "ARCHIVED" }, data: { path: ["formSet", "id"], equals: set.id } }, orderBy: { createdAt: "asc" } });
  for (const row of rows) await getWorkspaceRecordInTransaction(user, row.id, tx, permissions); // scope and subject visibility
  // Rows arrive oldest first and the sort is stable, so each label's first row is its original language.
  const sorted = rows.map(row => ({ row, paper: paperDataSchema.parse(row.data) })).sort((a, b) => FORM_LABELS.indexOf(a.paper.formSet!.label) - FORM_LABELS.indexOf(b.paper.formSet!.label));
  const members = sorted.map((member, index) => ({ ...member, label: member.paper.formSet!.label, original: sorted.findIndex(other => other.paper.formSet!.label === member.paper.formSet!.label) === index }));
  return { set, members, permissions };
}

async function writeVersion(tx: TxClient, user: AuthUser, record: { id: string; version: number; status: string }, paper: PaperData) {
  const updated = await tx.schoolAiRecord.updateMany({ where: { id: record.id, schoolId: user.schoolId, version: record.version, status: record.status }, data: { data: json(paper), version: { increment: 1 }, updatedById: user.userId } });
  if (updated.count !== 1) throw new SchoolAiError("This paper changed meanwhile. Reload and try again.", 409);
  const next = await tx.schoolAiRecord.findFirstOrThrow({ where: { id: record.id, schoolId: user.schoolId } });
  await tx.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: next.campusId, recordId: next.id, version: next.version, action: "SAVE", title: next.title, status: next.status, data: json(next.data), actorId: user.userId } });
  return next;
}

/** A new form: form A's blueprint and content with fresh item identities, as a draft the author then changes. */
async function createMember(tx: TxClient, user: AuthUser, source: { campusId: string | null; title: string; subjectId: string | null; classId: string | null }, paper: PaperData, formSetId: string, label: FormLabel, blueprintHash: string) {
  const itemGroupIds = Object.fromEntries(paper.questions.map(question => [question.id, randomUUID()]));
  const questions = paper.questions.map(question => { const copy = { ...question }; delete copy.review; delete copy.reusedFrom; return copy; });
  const data: PaperData = { ...paper, questions, itemGroupIds, formSet: { id: formSetId, label, blueprintHash } };
  delete data.staleness;
  const title = `${source.title.replace(/ · Form [A-D]$/u, "")} · Form ${label}`;
  const row = await tx.schoolAiRecord.create({ data: { schoolId: user.schoolId, campusId: source.campusId, kind: "PAPER", title, data: json(data), subjectId: source.subjectId, classId: source.classId, createdById: user.userId, updatedById: user.userId, idempotencyKey: `form-${formSetId}-${label}`, requestHash: `form-${formSetId}-${label}` } });
  await tx.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: row.campusId, recordId: row.id, version: row.version, action: "CREATE", title: row.title, status: row.status, data: json(row.data), actorId: user.userId } });
  return row;
}

async function maxFormsFor(tx: TxClient, user: AuthUser, campusId: string | null) {
  const policy = await resolveScopeDeliveryPolicy(user, campusId, tx);
  return Math.min(FORM_LABELS.length, policy.policy.maxForms);
}

/** R10.1: a draft paper becomes form A and, unless only language versions are wanted, form B is created beside it. */
export async function createFormSet(user: AuthUser, paperId: string, options: { forms?: 1 | 2 } = {}) {
  const forms = options.forms ?? 2;
  return schoolAiTransaction(user, async tx => {
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    await assertSchoolAiAccess(user, "add", permissions);
    await getWorkspaceRecordInTransaction(user, paperId, tx, permissions);
    const record = await tx.schoolAiRecord.findFirst({ where: { id: paperId, schoolId: user.schoolId, kind: "PAPER" } });
    if (!record) throw new SchoolAiError("Choose a saved paper.", 404);
    if (record.status !== "DRAFT") throw new SchoolAiError("Create parallel forms from a draft paper. Revise an approved paper into a draft first.", 409);
    const paper = paperDataSchema.parse(record.data);
    if (paper.formSet) throw new SchoolAiError("This paper is already a form in a set.", 409);
    const role = await assertStudioAction(user, "AUTHOR_ITEM", { schoolId: user.schoolId, campusId: record.campusId, subjectId: record.subjectId, classId: record.classId }, permissions, tx);
    const maxForms = await maxFormsFor(tx, user, record.campusId);
    if (maxForms < forms) throw new SchoolAiError("The delivery policy for this campus allows a single form only.", 409);
    const blueprintHash = blueprintHashFor(paper.blueprint);
    const brief = await tx.schoolAiRecord.findFirst({ where: { schoolId: user.schoolId, campusId: record.campusId, kind: "BRIEF", subjectId: record.subjectId, classId: record.classId, status: { not: "ARCHIVED" } }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    const set = await tx.schoolAiExamFormSet.create({ data: { schoolId: user.schoolId, campusId: record.campusId!, briefRecordId: brief?.id ?? null, blueprintHash, maxForms, createdById: user.userId } });
    await writeVersion(tx, user, record, { ...paper, itemGroupIds: Object.fromEntries(paper.questions.map(question => [question.id, itemGroupIdFor(paper, question.id)])), formSet: { id: set.id, label: "A", blueprintHash } });
    if (forms === 2) await createMember(tx, user, record, paper, set.id, "B", blueprintHash);
    await recordStudioAction(tx, user, { action: "AUTHOR_ITEM", role, targetId: set.id, targetVersion: set.version, campusId: record.campusId });
    return { id: set.id };
  });
}

/** Adds the next form label, up to the campus delivery policy's maximum (R10.1). */
export async function addForm(user: AuthUser, formSetId: string) {
  return schoolAiTransaction(user, async tx => {
    const { set, members, permissions } = await loadSet(tx, user, formSetId);
    if (set.status === "SEALED") throw new SchoolAiError("This form set is sealed. Create a new set to change its forms.", 409);
    await assertSchoolAiAccess(user, "add", permissions);
    const reference = members.find(member => member.label === "A" && member.original) ?? members[0];
    if (!reference) throw new SchoolAiError("This form set has no forms.", 409);
    const role = await assertStudioAction(user, "AUTHOR_ITEM", { schoolId: user.schoolId, campusId: set.campusId, subjectId: reference.row.subjectId, classId: reference.row.classId }, permissions, tx);
    const used = new Set(members.map(member => member.paper.formSet!.label));
    const next = FORM_LABELS.find(label => !used.has(label));
    if (!next || used.size >= set.maxForms) throw new SchoolAiError(`This form set already has the most forms its delivery policy allows (${set.maxForms}).`, 409);
    await createMember(tx, user, reference.row, reference.paper, set.id, next, set.blueprintHash);
    await recordStudioAction(tx, user, { action: "AUTHOR_ITEM", role, targetId: set.id, targetVersion: set.version, campusId: set.campusId });
    return { id: set.id, label: next };
  });
}

export const LANGUAGE_NAMES: Record<AssessmentLocale, string> = { en: "English", ar: "العربية", ur: "اردو" };
export const addLanguageSchema = z.strictObject({ label: z.enum(FORM_LABELS), language: z.enum(["en", "ar", "ur"]) });

/**
 * R9.1-R9.2: a language version of one form. It shares the form's item groups, so each translated
 * item is joined to its original, and it starts as a draft carrying the original text for the
 * translator to replace. Nothing is translated automatically.
 */
export async function addLanguageVersion(user: AuthUser, formSetId: string, raw: unknown) {
  const input = addLanguageSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { set, members, permissions } = await loadSet(tx, user, formSetId);
    if (set.status === "SEALED") throw new SchoolAiError("This form set is sealed. Create a new set to add a language.", 409);
    await assertSchoolAiAccess(user, "add", permissions);
    const original = members.find(member => member.label === input.label && member.original);
    if (!original) throw new SchoolAiError(`Form ${input.label} is not in this set.`, 404);
    if (members.some(member => member.label === input.label && member.paper.language === input.language)) throw new SchoolAiError(`Form ${input.label} already has a ${LANGUAGE_NAMES[input.language]} version.`, 409);
    const role = await assertStudioAction(user, "AUTHOR_ITEM", { schoolId: user.schoolId, campusId: set.campusId, subjectId: original.row.subjectId, classId: original.row.classId }, permissions, tx);
    const questions = original.paper.questions.map(question => { const copy = { ...question }; delete copy.review; delete copy.reusedFrom; return copy; });
    const itemGroupIds = Object.fromEntries(original.paper.questions.map(question => [question.id, itemGroupIdFor(original.paper, question.id)]));
    const data: PaperData = { ...original.paper, language: input.language, questions, itemGroupIds };
    delete data.staleness;
    const key = `lang-${set.id}-${input.label}-${input.language}`;
    const row = await tx.schoolAiRecord.create({ data: { schoolId: user.schoolId, campusId: original.row.campusId, kind: "PAPER", title: `${original.row.title} · ${LANGUAGE_NAMES[input.language]}`, data: json(data), subjectId: original.row.subjectId, classId: original.row.classId, createdById: user.userId, updatedById: user.userId, idempotencyKey: key, requestHash: key } });
    await tx.schoolAiRevision.create({ data: { schoolId: user.schoolId, campusId: row.campusId, recordId: row.id, version: row.version, action: "CREATE", title: row.title, status: row.status, data: json(row.data), actorId: user.userId } });
    await recordStudioAction(tx, user, { action: "AUTHOR_ITEM", role, targetId: set.id, targetVersion: set.version, campusId: set.campusId });
    return { id: set.id, recordId: row.id, label: input.label, language: input.language };
  });
}

const keyText = (question: PaperData["questions"][number]) => [
  ...question.options.filter(option => option.id === question.correctOptionId || question.correctOptionIds?.includes(option.id)).map(option => option.text),
  ...(question.numericKey ? [`${question.numericKey.value} ± ${question.numericKey.tolerance}`] : []),
].join(" · ");

/**
 * R10.3, R10.4, R10.6: structural parity, shared and differing items, identical-looking items that
 * are not declared shared, prior exposure of each item group, and whether the set may be assigned.
 */
export async function formSetReport(user: AuthUser, formSetId: string) {
  return schoolAiTransaction(user, async tx => {
    const { set, members } = await loadSet(tx, user, formSetId);
    const formMembers: FormSetMember[] = members.map(member => ({ label: member.label, language: member.paper.language, paper: member.paper }));
    const labels = [...new Set(formMembers.map(member => member.label))];
    const originals = members.filter(member => member.original);
    // R9.3-R9.5: every language version against its form's original, item group by item group.
    const languages = members.filter(member => !member.original).map(member => {
      const original = originals.find(entry => entry.label === member.label)!;
      const comparison = compareLanguageVersions({ language: original.paper.language, paper: original.paper }, { language: member.paper.language, paper: member.paper });
      const byGroup = new Map(member.paper.questions.map(question => [itemGroupIdFor(member.paper, question.id), question]));
      return {
        label: member.label, language: member.paper.language, originalLanguage: original.paper.language, recordId: member.row.id, comparison,
        items: original.paper.questions.map((question, index) => {
          const group = itemGroupIdFor(original.paper, question.id), translated = byGroup.get(group);
          const codes = comparison.observations.filter(entry => entry.itemGroupId === group).map(entry => entry.code);
          return {
            number: index + 1, codes, untranslated: !!translated && normalize(translated.prompt) === normalize(question.prompt),
            original: { prompt: question.prompt, options: question.options.map(option => option.text), key: keyText(question), marks: question.marks, rubric: question.rubric.map(row => row.criterion) },
            translated: translated ? { prompt: translated.prompt, options: translated.options.map(option => option.text), key: keyText(translated), marks: translated.marks, rubric: translated.rubric.map(row => row.criterion) } : null,
          };
        }),
      };
    });
    const precondition = formSetReleaseBlockers({ formSet: { id: set.id, schoolId: set.schoolId, campusId: set.campusId, briefRecordId: set.briefRecordId ?? set.id, blueprintHash: set.blueprintHash, labels, maxForms: set.maxForms, status: set.status as never, version: set.version, createdById: set.createdById }, members: formMembers, languageObservations: languages.flatMap(entry => entry.comparison.observations) });
    const reference = originals[0];
    const identical = reference ? originals.slice(1).flatMap(member => member.paper.questions.flatMap((question, index) => {
      const match = reference.paper.questions.findIndex(other => itemText(other) === itemText(question) && itemGroupIdFor(reference.paper, other.id) !== itemGroupIdFor(member.paper, question.id));
      return match >= 0 ? [{ label: member.label, number: index + 1, referenceNumber: match + 1 }] : [];
    })) : [];
    const groups = [...new Set(members.flatMap(member => member.paper.questions.map(question => itemGroupIdFor(member.paper, question.id))))];
    const exposures = await tx.schoolAiExposureEntry.findMany({ where: { schoolId: user.schoolId, campusId: set.campusId, itemGroupId: { in: groups }, NOT: { formSetId: set.id } }, select: { itemGroupId: true, examDate: true } });
    const rehearsals = await tx.schoolAiRehearsal.findMany({ where: { schoolId: user.schoolId, recordId: { in: members.map(member => member.row.id) } }, select: { recordId: true, paperVersion: true, blocking: true } });
    return {
      id: set.id, status: set.status, maxForms: set.maxForms, blueprintHash: set.blueprintHash, difficulty: "NOT_MEASURED" as const,
      forms: members.map(member => {
        const summary = precondition.parity.forms.find(form => form.form.label === member.label && form.form.language === member.paper.language);
        const rehearsal = rehearsals.find(row => row.recordId === member.row.id && row.paperVersion === member.row.version);
        return {
          label: member.label, language: member.paper.language, original: member.original, recordId: member.row.id, title: member.row.title, version: member.row.version, status: member.row.status,
          items: member.paper.questions.length, marks: member.paper.questions.reduce((sum, question) => sum + question.marks, 0), outcomes: summary?.summary.outcomeIds.length ?? 0,
          parity: summary?.parity ?? false, rehearsed: rehearsal ? (rehearsal.blocking ? "BLOCKING" as const : "CLEAN" as const) : "NONE" as const,
          priorExposure: member.paper.questions.filter(question => exposures.some(entry => entry.itemGroupId === itemGroupIdFor(member.paper, question.id))).length,
        };
      }),
      shared: precondition.parity.sharedItemGroupIds.length, differing: precondition.parity.changedItemGroupIds.length,
      coverage: precondition.parity.coverage, identical,
      languages: languages.map(({ comparison, ...entry }) => ({ ...entry, blocking: comparison.blocking.length, agreed: comparison.pairs.filter(pair => pair.agreed).length })),
      blockers: precondition.blockers.map(blocker => ({ code: blocker.code, label: blocker.form?.label ?? null, language: blocker.form?.language ?? null, subject: blocker.subject })),
      assignable: precondition.release === "PERMITTED" && members.length >= 1 && members.every(member => member.row.status === "APPROVED") && members.every(member => rehearsals.some(row => row.recordId === member.row.id && row.paperVersion === member.row.version && row.blocking === 0)),
    };
  });
}

export const assignFormSetSchema = z.strictObject({
  idempotencyKey: z.uuid(), title: z.string().trim().min(1).max(160),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(), studentIds: z.array(z.string().min(1).max(120)).min(2).max(500),
  mode: z.enum(["STANDARD"]).default("STANDARD"),
});

/**
 * R10.4, R10.8: the whole set is assigned or refused. Every candidate gets exactly one form before
 * anyone starts; each form becomes its own sealed assignment (so reload, recovery and scanning all
 * resolve to that form's frozen paper), and every placed item is written to the exposure ledger.
 * Form assignments use derived idempotency keys, so a retry after a partial failure completes the set.
 */
export async function assignFormSet(user: AuthUser, formSetId: string, raw: unknown) {
  const input = assignFormSetSchema.parse(raw);
  const plan = await schoolAiTransaction(user, async tx => {
    const { set, members } = await loadSet(tx, user, formSetId);
    if (!members.length) throw new SchoolAiError("This form set has no forms.", 409);
    if (members.some(member => member.row.status !== "APPROVED")) throw new SchoolAiError("Approve every form before assigning the set.", 409);
    const existing = await tx.schoolAiExamFormAllocation.findMany({ where: { schoolId: user.schoolId, formSetId: set.id } });
    if (existing.length && set.status !== "SEALED") throw new SchoolAiError("This form set is part-way through assignment. Retry with the same request to complete it.", 409);
    const labels = [...new Set(members.map(member => member.label))];
    const allocation = allocateForms({ formSetId: set.id, labels, studentIds: input.studentIds, existing: existing.map(row => ({ formSetId: row.formSetId, studentId: row.studentId, formLabel: row.formLabel as FormLabel, assignmentId: row.assignmentId })) });
    if (allocation.issues.length) throw new SchoolAiError("Every candidate needs exactly one form in this set.", 409);
    // R9.10: each candidate sits their form in their own language when an approved version of it exists.
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: input.studentIds } }, select: { id: true, studentUserId: true } });
    const preferred = new Map((await tx.user.findMany({ where: { schoolId: user.schoolId, id: { in: students.map(row => row.studentUserId).filter(Boolean) as string[] } }, select: { id: true, preferredLanguage: true } })).map(row => [row.id, row.preferredLanguage]));
    const versions = allocation.perLabel.flatMap(entry => {
      const forLabel = members.filter(member => member.label === entry.formLabel);
      const original = forLabel.find(member => member.original)!;
      const byLanguage = new Map<string, string[]>();
      for (const studentId of entry.studentIds) {
        const wanted = preferred.get(students.find(row => row.id === studentId)?.studentUserId ?? "") ?? null;
        const version = forLabel.find(member => member.paper.language === wanted) ?? original;
        byLanguage.set(version.row.id, [...(byLanguage.get(version.row.id) ?? []), studentId]);
      }
      return [...byLanguage.entries()].map(([recordId, studentIds]) => { const member = forLabel.find(entry => entry.row.id === recordId)!; return { label: entry.formLabel, language: member.paper.language, original: member.original, id: member.row.id, paper: member.paper, studentIds }; });
    });
    return { set, versions };
  });
  // Structural parity is re-checked before any form is released (R10.4: one failing form refuses the set).
  const report = await formSetReport(user, formSetId);
  if (plan.set.status !== "SEALED" && !report.assignable) throw new SchoolAiError(report.blockers.length ? `The form set is not at parity: ${[...new Set(report.blockers.map(blocker => blocker.code))].join(", ")}.` : "Rehearse every form clean before assigning the set.", 409);
  const assignments: Array<{ label: FormLabel; language: AssessmentLocale; recordId: string; paper: PaperData; id: string; studentIds: string[] }> = [];
  for (const version of plan.versions) {
    const suffix = version.original ? "" : ` · ${LANGUAGE_NAMES[version.language]}`;
    const seed = version.original ? `${input.idempotencyKey}:${formSetId}:${version.label}` : `${input.idempotencyKey}:${formSetId}:${version.label}:${version.language}`;
    const exam = await createSchoolAiExam(user, { idempotencyKey: derivedUuid(seed), paperId: version.id, title: `${input.title} · Form ${version.label}${suffix}`, startsAt: input.startsAt, endsAt: input.endsAt, studentIds: version.studentIds, mode: input.mode });
    assignments.push({ label: version.label, language: version.language, recordId: version.id, paper: version.paper, id: exam.id, studentIds: version.studentIds });
  }
  return schoolAiTransaction(user, async tx => {
    const set = await tx.schoolAiExamFormSet.findFirstOrThrow({ where: { id: formSetId, schoolId: user.schoolId } });
    for (const assignment of assignments) {
      const member = { id: assignment.recordId, paper: assignment.paper };
      const stored = await tx.schoolAiExamAssignment.findFirstOrThrow({ where: { id: assignment.id, schoolId: user.schoolId }, select: { contentHash: true, rehearsalId: true, classId: true, startsAt: true, paperVersion: true } });
      await tx.schoolAiExamAssignment.updateMany({ where: { id: assignment.id, schoolId: user.schoolId }, data: { formSetId: set.id, formLabel: assignment.label } });
      await tx.schoolAiExamFormAllocation.createMany({ data: assignment.studentIds.map(studentId => ({ schoolId: user.schoolId, campusId: set.campusId, formSetId: set.id, studentId, formLabel: assignment.label, assignmentId: assignment.id, createdById: user.userId })), skipDuplicates: true });
      await tx.schoolAiExamFormRelease.upsert({
        where: { formSetId_formLabel_language: { formSetId: set.id, formLabel: assignment.label, language: member.paper.language } }, update: {},
        create: { schoolId: user.schoolId, campusId: set.campusId, formSetId: set.id, paperId: member.id, paperVersion: stored.paperVersion, formLabel: assignment.label, language: member.paper.language, contentHash: stored.contentHash ?? contentHash(member.paper), rehearsalId: stored.rehearsalId ?? "", releasedById: user.userId },
      });
      if (!(await tx.schoolAiExposureEntry.count({ where: { schoolId: user.schoolId, formSetId: set.id, formLabel: assignment.label } }))) {
        await tx.schoolAiExposureEntry.createMany({ data: member.paper.questions.map(question => ({ schoolId: user.schoolId, campusId: set.campusId, itemGroupId: itemGroupIdFor(member.paper, question.id), questionId: question.id, itemRevision: question.review?.itemRevision ?? 1, paperId: member.id, paperVersion: stored.paperVersion, formSetId: set.id, formLabel: assignment.label, cohortIds: json([stored.classId]), examDate: stored.startsAt })) });
      }
    }
    if (set.status !== "SEALED") await tx.schoolAiExamFormSet.updateMany({ where: { id: set.id, schoolId: user.schoolId }, data: { status: "SEALED", version: { increment: 1 } } });
    await writeAuditEvent(tx, user, { table: "school_ai_exam_form_sets", recordId: set.id, action: "UPDATE", campusId: set.campusId, after: { status: "SEALED", forms: assignments.length, candidates: assignments.reduce((sum, row) => sum + row.studentIds.length, 0) } });
    return { id: set.id, assignments: assignments.map(row => ({ label: row.label, language: row.language, id: row.id, candidates: row.studentIds.length })) };
  });
}
