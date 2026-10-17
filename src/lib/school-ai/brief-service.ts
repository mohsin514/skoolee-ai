import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError, assertSchoolAiAccess, loadWorkspacePermissionSnapshot } from "./access";
import { curriculumDataSchema } from "./assessment";
import {
  BRIEF_QUESTION_SEQUENCE, acceptSuggestion, assessmentBriefSchema, briefQuestionKeySchema, briefReadiness, confirmDecision,
  nextOpenDecision, resumeDecision, skipDecision, suggestDecision, type AssessmentBrief, type BriefWriteResult,
} from "./assessment-brief";
import { getWorkspaceRecordInTransaction, updateWorkspaceRecordInTransaction } from "./repository";
import { assertStudioAction, recordStudioAction } from "./studio-access";
import { schoolAiTransaction } from "./transaction";

// SKO-408 task 5.2: the brief service. The pure transitions in `assessment-brief.ts` decide what a
// write means; this module adds the reads they need (actor, scope, approved curriculum coverage),
// writes each accepted answer as a new immutable record version (R3.9, R3.13) and refuses an answer
// that names untaught or unknown outcomes with a precise decision request (§3A acceptance).

const version = z.number().int().positive();
export const briefAnswerInput = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("confirm"), version, key: briefQuestionKeySchema, value: z.unknown() }),
  z.strictObject({ op: z.literal("accept"), version, key: briefQuestionKeySchema }),
  z.strictObject({ op: z.literal("skip"), version, key: briefQuestionKeySchema, enteredText: z.string().max(2000).optional() }),
  // Offers the confirmed coverage of an approved curriculum section as a suggestion the author must accept (R3.4).
  z.strictObject({ op: z.literal("suggest-coverage"), version, curriculumId: z.string().min(1).max(128), section: z.string().min(1).max(120) }),
]);

type CoverageChoice = { curriculumId: string; curriculumVersion: number; title: string; sections: Array<{ section: string; taughtOn: string; outcomes: Array<{ id: string; title: string }> }> };

async function briefRecord(tx: TxClient, user: AuthUser, recordId: string) {
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  await getWorkspaceRecordInTransaction(user, recordId, tx, permissions);
  const record = await tx.schoolAiRecord.findFirst({ where: { id: recordId, schoolId: user.schoolId, kind: "BRIEF" } });
  if (!record) throw new SchoolAiError("Choose a saved assessment brief.", 404);
  return { record, brief: assessmentBriefSchema.parse(record.data), permissions };
}

/** Approved curricula for the brief's class and subject, with only their confirmed taught sections. */
async function coverageChoices(tx: TxClient, user: AuthUser, record: { campusId: string | null; subjectId: string | null; classId: string | null }): Promise<CoverageChoice[]> {
  if (!record.subjectId || !record.classId) return [];
  const rows = await tx.schoolAiRecord.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, kind: "CURRICULUM", status: "APPROVED", subjectId: record.subjectId, classId: record.classId }, orderBy: { updatedAt: "desc" }, take: 10 });
  return rows.map(row => {
    const curriculum = curriculumDataSchema.parse(row.data);
    const titles = new Map(curriculum.outcomes.map(outcome => [outcome.id, outcome]));
    return {
      curriculumId: row.id, curriculumVersion: row.version, title: row.title,
      sections: (curriculum.sectionCoverage ?? []).filter(entry => entry.confirmed).map(entry => ({
        section: entry.section, taughtOn: entry.taughtOn,
        outcomes: entry.outcomeIds.filter(id => titles.get(id)?.taught).map(id => ({ id, title: titles.get(id)!.title })),
      })).filter(entry => entry.outcomes.length > 0),
    };
  });
}

/** §3A: untaught or unknown outcomes are a precise decision request, never a silent acceptance. */
function coverageIssues(value: unknown, choices: CoverageChoice[]): string | null {
  const parsed = z.object({ section: z.string(), outcomeIds: z.array(z.string()) }).safeParse(value);
  if (!parsed.success) return null; // the bound check reports the shape
  const section = choices.flatMap(choice => choice.sections).find(entry => entry.section === parsed.data.section);
  if (!section) return `Section ${parsed.data.section} has no confirmed taught coverage in an approved curriculum for this class and subject. Confirm its coverage in the curriculum first, or choose a covered section.`;
  const taught = new Set(section.outcomes.map(outcome => outcome.id));
  const untaught = parsed.data.outcomeIds.filter(id => !taught.has(id));
  return untaught.length ? `These outcomes are not recorded as taught in section ${parsed.data.section}: ${untaught.join(", ")}. Remove them or record them as taught first.` : null;
}

function view(record: { id: string; version: number; status: string; title: string; subjectId: string | null; classId: string | null }, brief: AssessmentBrief, coverage: CoverageChoice[]) {
  return {
    record: { id: record.id, version: record.version, status: record.status, title: record.title, subjectId: record.subjectId, classId: record.classId },
    brief, readiness: briefReadiness(brief), next: nextOpenDecision(brief), resume: resumeDecision(brief),
    sequence: BRIEF_QUESTION_SEQUENCE, coverage,
  };
}
export type BriefView = ReturnType<typeof view>;

export async function getBrief(user: AuthUser, recordId: string) {
  return schoolAiTransaction(user, async tx => {
    const { record, brief } = await briefRecord(tx, user, recordId);
    return view(record, brief, await coverageChoices(tx, user, record));
  });
}

/** Thrown with the brief that keeps the entered text, so the client shows the bound and the text (R3.12). */
export class BriefRefusedError extends SchoolAiError {
  constructor(public readonly result: Extract<BriefWriteResult, { ok: false }>, public readonly view: BriefView, code?: string) {
    super(result.detail, result.reason === "FAILED_BOUND" ? 422 : 409, code ?? `BRIEF_${result.reason}`);
  }
}

export async function answerBrief(user: AuthUser, recordId: string, raw: unknown) {
  const input = briefAnswerInput.parse(raw);
  const outcome = await schoolAiTransaction(user, async tx => {
    const { record, brief, permissions } = await briefRecord(tx, user, recordId);
    if (record.version !== input.version) throw new SchoolAiError("This brief changed meanwhile. Reload to see the current answers.", 409);
    if (record.status !== "DRAFT") throw new SchoolAiError("This brief version is in review or approved. Create a revised draft to change it.", 409);
    const role = await assertStudioAction(user, "AUTHOR_ITEM", { schoolId: record.schoolId, campusId: record.campusId, subjectId: record.subjectId, classId: record.classId }, permissions, tx);
    if (!brief.subjectId || !brief.classId) throw new SchoolAiError("Choose the class and subject this brief is for before answering.", 422, "BRIEF_SCOPE_MISSING");
    const coverage = await coverageChoices(tx, user, record);
    const scope = { schoolId: user.schoolId, campusId: record.campusId, classId: brief.classId, subjectId: brief.subjectId };
    const at = new Date();
    let result: BriefWriteResult, code: string | undefined;
    if (input.op === "confirm") {
      const issue = input.key === "taughtCoverage" ? coverageIssues(input.value, coverage) : null;
      if (issue) {
        // Keep what the author chose against the open decision, exactly as a failed bound does (R3.12).
        const current = brief.decisions.taughtCoverage;
        const retained = current.classification === "OPEN_DECISION" ? assessmentBriefSchema.safeParse({ ...brief, decisions: { ...brief.decisions, taughtCoverage: { ...current, lastEnteredText: JSON.stringify(input.value).slice(0, 2000) } } }) : null;
        result = { ok: false, reason: "FAILED_BOUND", detail: issue, brief: retained?.success ? retained.data : brief }; code = "BRIEF_UNTAUGHT_OUTCOME";
      } else result = confirmDecision(brief, { key: input.key, value: input.value as never, actorId: user.userId, at, scope });
    } else if (input.op === "accept") {
      const current = brief.decisions[input.key];
      const stale = input.key === "taughtCoverage" && current.classification === "EXTRACTED_SUGGESTION" ? coverageIssues(current.value, coverage) : null;
      if (stale) throw new SchoolAiError(stale, 409, "BRIEF_SUGGESTION_STALE");
      result = acceptSuggestion(brief, { key: input.key, actorId: user.userId, at, scope });
    } else if (input.op === "skip") result = skipDecision(brief, { key: input.key, actorId: user.userId, at, enteredText: input.enteredText });
    else {
      const choice = coverage.find(entry => entry.curriculumId === input.curriculumId);
      const section = choice?.sections.find(entry => entry.section === input.section);
      if (!choice || !section) throw new SchoolAiError("That section has no confirmed taught coverage in an approved curriculum for this class and subject.", 404);
      result = suggestDecision(brief, {
        key: "taughtCoverage", value: { section: section.section, outcomeIds: section.outcomes.map(outcome => outcome.id) }, actorId: user.userId, at,
        sourceId: choice.curriculumId, sourceVersion: choice.curriculumVersion, reference: `${choice.title} · ${section.section} · ${section.taughtOn}`,
        excerpt: section.outcomes.map(outcome => outcome.title).join(" · ").slice(0, 3000), origin: "APPROVED_SOURCE",
      });
    }
    if (!result.ok) return { refused: result, code, view: view(record, result.brief, coverage) };
    const saved = await updateWorkspaceRecordInTransaction(user, record.id, { version: record.version, data: result.brief as unknown as Record<string, unknown> }, tx, permissions);
    await recordStudioAction(tx, user, { action: "AUTHOR_ITEM", role, targetId: record.id, targetVersion: saved.version, at, campusId: record.campusId });
    return { refused: null, code: undefined, view: view({ ...record, version: saved.version, status: saved.status }, result.brief, coverage) };
  });
  if (outcome.refused) throw new BriefRefusedError(outcome.refused, outcome.view, outcome.code);
  return outcome.view;
}
