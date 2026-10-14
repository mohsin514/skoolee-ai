import { z } from "zod";
import { assessmentLanguageSchema, bankDifficultySchema, paperDataSchema, questionTypeSchema, validateBlueprint, type CurriculumData, type PaperData, type Question } from "./assessment";
const id = z.string().trim().min(1).max(120);
export const bankFiltersSchema = z.object({
  campusId: id, subjectId: id, classId: id,
  search: z.string().trim().max(120).optional(), tag: z.string().trim().max(80).optional(),
  language: assessmentLanguageSchema.optional(), type: questionTypeSchema.optional(), difficulty: bankDifficultySchema.optional(),
  minMarks: z.coerce.number().min(0.25).max(100).optional(), maxMarks: z.coerce.number().min(0.25).max(100).optional(),
  cursor: z.string().max(600).optional(),
}).strict().refine((value) => value.minMarks === undefined || value.maxMarks === undefined || value.minMarks <= value.maxMarks, "Minimum marks cannot exceed maximum marks.");
export const bankSourceSchema = z.object({ paperId: id, paperVersion: z.number().int().positive(), questionId: id }).strict();
export const bankReuseSchema = z.object({
  source: bankSourceSchema, paper: paperDataSchema, sectionId: id, replaceQuestionId: id.optional(),
  mappings: z.array(z.object({ sourceOutcomeId: id, targetOutcomeId: id }).strict()).min(1).max(50),
  alignmentConfirmed: z.literal(true),
}).strict();
export type BankFilters = z.infer<typeof bankFiltersSchema>;
export type BankReuseInput = z.infer<typeof bankReuseSchema>;
export type BankEntry = {
  source: z.infer<typeof bankSourceSchema>; paperTitle: string; approvedAt: string; campusId: string;
  language: PaperData["language"]; subjectId: string; classId: string;
  curriculumId: string; curriculumVersion: number;
  question: Question;
  outcomes: Array<{ id: string; title: string; sourceTitle: string; sourceReference: string; page: string }>;
};
const normalized = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function bankQuestionMatches(question: Question, paper: PaperData, filters: BankFilters) {
  if (paper.subjectId !== filters.subjectId || paper.classId !== filters.classId) return false;
  if (filters.language && paper.language !== filters.language || filters.type && question.type !== filters.type) return false;
  if (filters.difficulty && (question.bankMetadata?.difficulty ?? "UNSPECIFIED") !== filters.difficulty) return false;
  if (filters.minMarks !== undefined && question.marks < filters.minMarks || filters.maxMarks !== undefined && question.marks > filters.maxMarks) return false;
  if (filters.tag && !question.bankMetadata?.tags.some((tag) => normalized(tag) === normalized(filters.tag!))) return false;
  return !filters.search || normalized(`${question.prompt} ${paper.blueprint.title} ${question.bankMetadata?.tags.join(" ") ?? ""}`).includes(normalized(filters.search));
}

/** Structural evidence mapping only. A reviewer must still judge meaning, difficulty and suitability. */
export function reuseBankQuestion(input: BankReuseInput, source: { paperId: string; paperVersion: number; paper: PaperData; curriculum: CurriculumData }, target: CurriculumData, newId: string): PaperData {
  const { paper, sectionId, mappings, replaceQuestionId } = input;
  if (source.paperId !== input.source.paperId || source.paperVersion !== input.source.paperVersion) throw new Error("The source version does not match the selected bank entry.");
  const issues = validateBlueprint(paper.blueprint, target);
  if (issues.length) throw new Error(issues.join(" "));
  if (!input.alignmentConfirmed) throw new Error("Review the question and current curriculum before inserting.");
  if (paper.subjectId !== target.subjectId || paper.classId !== target.classId || source.paper.subjectId !== paper.subjectId || source.paper.classId !== paper.classId || source.paper.language !== paper.language) throw new Error("Reuse requires the same subject, class and paper language. Translation requires a separate reviewed draft.");
  const original = source.paper.questions.find((question) => question.id === input.source.questionId);
  const section = paper.blueprint.sections.find((item) => item.id === sectionId);
  if (!original || !section) throw new Error("Choose an available question and target section.");
  if (original.type !== section.type || Math.abs(original.marks - section.marksPerQuestion) > 0.00001) throw new Error("Question type and marks must match the target section.");
  if (new Set(paper.questions.map((question) => question.id)).size !== paper.questions.length || paper.questions.some((question) => question.id === newId)) throw new Error("Question identifiers must be unique.");
  const replaced = replaceQuestionId ? paper.questions.find((question) => question.id === replaceQuestionId) : undefined;
  if (replaceQuestionId && (!replaced || replaced.sectionId !== sectionId || replaced.locked)) throw new Error("Only an unlocked question in the target section can be replaced.");
  const kept = paper.questions.filter((question) => question.id !== replaceQuestionId);
  if (kept.length >= 100 || kept.filter((question) => question.sectionId === sectionId).length >= section.questionCount) throw new Error("This section has no free question slot. Adjust the blueprint or choose an unlocked question to replace.");
  if (kept.some((question) => normalized(question.prompt) === normalized(original.prompt))) throw new Error("This prompt is already in the paper. Review duplicates before reuse.");
  if (mappings.length !== original.outcomeIds.length || new Set(mappings.map((mapping) => mapping.sourceOutcomeId)).size !== mappings.length || new Set(mappings.map((mapping) => mapping.targetOutcomeId)).size !== mappings.length || original.outcomeIds.some((outcomeId) => !mappings.some((mapping) => mapping.sourceOutcomeId === outcomeId))) throw new Error("Explicitly map every source outcome once to distinct current outcomes.");
  const refs: Question["sourceRefs"] = [];
  for (const mapping of mappings) {
    const from = source.curriculum.outcomes.find((outcome) => outcome.id === mapping.sourceOutcomeId);
    const to = target.outcomes.find((outcome) => outcome.id === mapping.targetOutcomeId && outcome.taught && outcome.included && section.outcomeIds.includes(outcome.id));
    const material = to && target.sources.find((item) => item.id === to.sourceId && item.approved);
    const evidence = from ? original.sourceRefs.filter((ref) => ref.sourceId === from.sourceId && ref.page === from.sourcePage) : [];
    if (!to || !material || !evidence.length || evidence.some((ref) => !ref.excerpt.trim() || !material.excerpt.includes(ref.excerpt))) throw new Error("The selected current outcome does not contain the quoted source evidence. Review the curriculum or author a new question.");
    for (const ref of evidence) if (!refs.some((item) => item.sourceId === to.sourceId && item.page === to.sourcePage && item.excerpt === ref.excerpt)) refs.push({ sourceId: to.sourceId, page: to.sourcePage, excerpt: ref.excerpt });
  }
  const options = original.options.map((option, index) => ({ ...option, id: `${newId}:o${index}` }));
  const correctIndex = original.options.findIndex((option) => option.id === original.correctOptionId);
  const rubric = original.rubric.map((criterion, index) => ({ ...criterion, id: `${newId}:r${index}` }));
  const copied: Question = { ...structuredClone(original), id: newId, sectionId, options, rubric, correctOptionId: correctIndex >= 0 ? options[correctIndex].id : null, outcomeIds: mappings.map((mapping) => mapping.targetOutcomeId), sourceRefs: refs, locked: true, reusedFrom: { paperId: source.paperId, paperVersion: source.paperVersion, questionId: original.id, curriculumId: source.paper.curriculumId, curriculumVersion: source.paper.curriculumVersion } };
  const questions = replaced ? paper.questions.map((question) => question.id === replaced.id ? copied : question) : [...paper.questions, copied];
  return paperDataSchema.parse({ ...paper, questions });
}
