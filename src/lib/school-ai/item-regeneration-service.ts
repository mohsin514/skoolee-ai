import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { generateAIDraft } from "@/lib/ai/openai";
import { prisma } from "@/lib/db/prisma";
import { SchoolAiError } from "./access";
import { paperDataSchema, type PaperData, type Question } from "./assessment";
import { COMPARED_ITEM_FIELDS, type ComparedItemField } from "./item-review";
import { PAPER_GENERATION_FEATURE, paperGenerationReplySchema } from "./paper-generation";
import { generatePaperWithReceipt } from "./paper-generation-service";
import { getWorkspaceRecord, updateWorkspaceRecord } from "./repository";
import { assertStudioAction } from "./studio-access";

// SKO-408 R5.3–R5.7: regenerate one item and compare before anything changes. Every other item is
// sent pinned and the candidate paper is rebuilt from the stored originals, so they are preserved
// byte for byte by construction. Regeneration writes nothing to the paper; accepting re-derives the
// candidate from the server's own receipt (never from the client) and saves it through the ordinary
// paper write, which resets the item's review and records the change in its history, while the
// previous record revision keeps the superseded item. Rejecting is simply not accepting.

export const regenerateItemSchema = z.strictObject({ idempotencyKey: z.string().uuid(), version: z.number().int().positive() });
type Dependencies = { generate?: typeof generateAIDraft; assertProvider?: () => void };

async function paperFor(user: AuthUser, recordId: string, version: number) {
  const record = await getWorkspaceRecord(user, recordId);
  if (record.kind !== "PAPER") throw new SchoolAiError("Choose a paper.", 404);
  if (record.version !== version) throw new SchoolAiError("This paper changed. Reload it before regenerating an item.", 409, "PAPER_VERSION_CHANGED");
  if (record.status !== "DRAFT") throw new SchoolAiError("Return the paper to draft before regenerating an item.", 409);
  const paper = paperDataSchema.parse(record.data);
  await assertStudioAction(user, "AUTHOR_ITEM", { schoolId: user.schoolId, campusId: record.campusId, subjectId: paper.subjectId, classId: paper.classId });
  return { record, paper };
}

/** The candidate item from a generated paper: the one item that is not one of the pinned originals. */
function candidateFrom(paper: PaperData, generated: PaperData, questionId: string): Question {
  const target = paper.questions.find(question => question.id === questionId)!;
  const others = new Set(paper.questions.filter(question => question.id !== questionId).map(question => question.id));
  const fresh = generated.questions.filter(question => !others.has(question.id));
  const pick = fresh.find(question => question.sectionId === target.sectionId) ?? fresh[0];
  if (!pick) throw new SchoolAiError("The regenerated draft did not contain a new item. Your paper is unchanged.", 422, "AI_GENERATION_INVALID_OUTPUT");
  const { review: _review, reusedFrom: _origin, ...content } = pick;
  return { ...content, id: target.id, sectionId: target.sectionId, locked: false };
}

const differing = (previous: Question, candidate: Question): ComparedItemField[] => COMPARED_ITEM_FIELDS.filter(field => !isDeepStrictEqual(previous[field], candidate[field]));
const withoutReview = (question: Question) => { const { review: _review, ...rest } = question; return rest; };

/** R5.3, R5.5: a candidate for one item beside the current one, with the differing fields named. */
export async function regenerateItem(user: AuthUser, recordId: string, questionId: string, raw: unknown, dependencies: Dependencies = {}) {
  const input = regenerateItemSchema.parse(raw ?? {});
  const { paper } = await paperFor(user, recordId, input.version);
  const target = paper.questions.find(question => question.id === questionId);
  if (!target) throw new SchoolAiError("That item is not in this paper.", 404);
  if (target.locked) throw new SchoolAiError("This item is pinned. Unpin it before regenerating it.", 409, "ITEM_PINNED");
  // SKO-501 (audit 4.4, critical): locked items are sent as content only; an item's review record is
  // the paper's own history and the generation request refuses it, which broke regeneration for any
  // paper with one reviewed item. The accepted candidate is merged back by id, so reviews are kept.
  const lockedQuestions = paper.questions.filter(question => question.id !== questionId).map(question => ({ ...withoutReview(question), locked: true }));
  const receipt = await generatePaperWithReceipt(user, {
    idempotencyKey: input.idempotencyKey, curriculumId: paper.curriculumId, curriculumVersion: paper.curriculumVersion,
    blueprint: paper.blueprint, language: paper.language, ...(paper.coverageSection ? { coverageSection: paper.coverageSection } : {}), lockedQuestions,
  }, dependencies);
  if (receipt.status !== 200 || !("paper" in receipt.body)) return { status: receipt.status, body: receipt.body };
  const candidate = candidateFrom(paper, receipt.body.paper as PaperData, questionId);
  return { status: 200, body: { key: input.idempotencyKey, version: input.version, previous: withoutReview(target), candidate, differingFields: differing(target, candidate) } };
}

/** R5.6: accept the candidate recorded for `idempotencyKey`; the paper must not have changed meanwhile. */
export async function acceptRegeneratedItem(user: AuthUser, recordId: string, questionId: string, raw: unknown) {
  const input = regenerateItemSchema.parse(raw ?? {});
  const { paper } = await paperFor(user, recordId, input.version);
  const target = paper.questions.find(question => question.id === questionId);
  if (!target) throw new SchoolAiError("That item is not in this paper.", 404);
  const row = await prisma.schoolAiRequest.findFirst({ where: { schoolId: user.schoolId, actorId: user.userId, feature: PAPER_GENERATION_FEATURE, idempotencyKey: input.idempotencyKey, status: "COMPLETED" }, select: { reply: true } });
  if (!row?.reply) throw new SchoolAiError("That regeneration is not available to accept. Regenerate the item again.", 404);
  const generated = paperGenerationReplySchema.parse(JSON.parse(row.reply)).paper;
  // The receipt must have been produced against exactly the other items the paper holds now.
  for (const question of paper.questions) {
    if (question.id === questionId) continue;
    const pinned = generated.questions.find(item => item.id === question.id);
    if (!pinned || !isDeepStrictEqual({ ...pinned, locked: question.locked }, question)) throw new SchoolAiError("The paper changed after this item was regenerated. Regenerate it again.", 409, "PAPER_VERSION_CHANGED");
  }
  const candidate = candidateFrom(paper, generated, questionId);
  // Carrying the stored review lets the ordinary write record the content change in the item history.
  const questions = paper.questions.map(question => question.id === questionId ? { ...candidate, ...(target.review ? { review: target.review } : {}) } : question);
  return updateWorkspaceRecord(user, recordId, { version: input.version, data: { ...paper, questions } as unknown as Record<string, unknown> });
}
