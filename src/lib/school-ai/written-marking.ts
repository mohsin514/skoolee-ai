import { z } from "zod";
import type { PaperData } from "./assessment";
import { examReviewSchema, validateExamReview, type ExamResponses } from "./exam";
export const writtenMarkingRequestSchema = z.object({ attemptId: z.string().min(1).max(120), questionId: z.string().min(1).max(120), version: z.number().int().min(0), idempotencyKey: z.string().uuid(), language: z.enum(["en", "ar", "ur"]) }).strict();
export const writtenMarkProposalSchema = examReviewSchema.shape.marks.element;
export function validateWrittenProposal(paper: PaperData, responses: ExamResponses, raw: unknown) {
 const proposal = writtenMarkProposalSchema.parse(raw), question = paper.questions.find(row => row.id === proposal.questionId);
 if (!question || ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERIC"].includes(question.type) || !responses[question.id]?.trim()) throw new Error("WRITTEN_RESPONSE_REQUIRED");
 if (!proposal.evidence?.length) throw new Error("RUBRIC_EVIDENCE_REQUIRED");
 const issues = validateExamReview({ ...paper, questions: [question] }, { [question.id]: responses[question.id] }, { note: "Evidence proposal", marks: [proposal] });
 if (issues.length) throw new Error(issues.join(" "));
 return proposal;
}
