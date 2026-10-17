import { z } from "zod";
import { assessmentLanguageSchema, bankDifficultySchema, paperDataSchema, questionTypeSchema, validateBlueprint, type CurriculumData, type PaperData, type Question } from "./assessment";
const id = z.string().trim().min(1).max(120);
export const bankFiltersSchema = z.object({
  campusId: id, subjectId: id, classId: id,
  search: z.string().trim().max(120).optional(), tag: z.string().trim().max(80).optional(),
  language: assessmentLanguageSchema.optional(), type: questionTypeSchema.optional(), difficulty: bankDifficultySchema.optional(),
  minMarks: z.coerce.number().min(0.25).max(100).optional(), maxMarks: z.coerce.number().min(0.25).max(100).optional(),
  cursor: z.string().max(600).optional(),
  // SKO-407: the curriculum version the teacher is assembling for, and an optional objective in it.
  targetCurriculumId: id.optional(), targetCurriculumVersion: z.coerce.number().int().positive().optional(), outcomeId: id.optional(),
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
  alignment?: ReuseAlignment;
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
  const correctOptionIds = original.correctOptionIds?.map((optionId) => {
    const index = original.options.findIndex((option) => option.id === optionId);
    if (index < 0) throw new Error("The source answer key does not match its question options.");
    return options[index].id;
  });
  const rubric = original.rubric.map((criterion, index) => ({ ...criterion, id: `${newId}:r${index}` }));
  // The originating paper's item approval does not travel with the copy: this item has a new identifier,
  // new options, a new rubric, new outcomes and new source evidence, so it needs its own review.
  const { review: _supersededReview, ...carried } = structuredClone(original);
  const copied: Question = { ...carried, id: newId, sectionId, options, rubric, correctOptionId: correctIndex >= 0 ? options[correctIndex].id : null, ...(correctOptionIds ? { correctOptionIds } : {}), outcomeIds: mappings.map((mapping) => mapping.targetOutcomeId), sourceRefs: refs, locked: true, reusedFrom: { paperId: source.paperId, paperVersion: source.paperVersion, questionId: original.id, curriculumId: source.paper.curriculumId, curriculumVersion: source.paper.curriculumVersion } };
  const questions = replaced ? paper.questions.map((question) => question.id === replaced.id ? copied : question) : [...paper.questions, copied];
  return paperDataSchema.parse({ ...paper, questions });
}

// ─── SKO-407: reuse across curricula follows reviewed objective decisions ────────
export type ObjectiveDecision = { fromRecordId: string; fromVersion: number; fromOutcomeId: string; toRecordId: string; toVersion: number; toOutcomeId: string; relation: string; createdAt: Date | string };
export type CurriculumRef = { curriculumId: string; curriculumVersion: number };
export type ReuseAlignment =
  | { mode: "SAME_VERSION" }
  | { mode: "MAPPED"; targets: Record<string, Array<{ outcomeId: string; relation: "SAME" | "PARTIAL" | "STABLE_ID" }>> };

/** Latest decision per objective pair, read in either direction. NOT_EQUIVALENT and missing decisions allow nothing. */
export function reuseAlignment(source: CurriculumRef, target: CurriculumRef, sourceOutcomeIds: string[], targetOutcomeIds: string[], decisions: ObjectiveDecision[]): ReuseAlignment {
  if (source.curriculumId === target.curriculumId && source.curriculumVersion === target.curriculumVersion) return { mode: "SAME_VERSION" };
  const latest = new Map<string, ObjectiveDecision>();
  for (const decision of [...decisions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
    const forward = decision.fromRecordId === source.curriculumId && decision.fromVersion === source.curriculumVersion && decision.toRecordId === target.curriculumId && decision.toVersion === target.curriculumVersion;
    const backward = decision.toRecordId === source.curriculumId && decision.toVersion === source.curriculumVersion && decision.fromRecordId === target.curriculumId && decision.fromVersion === target.curriculumVersion;
    if (!forward && !backward) continue;
    const key = forward ? `${decision.fromOutcomeId}\u0000${decision.toOutcomeId}` : `${decision.toOutcomeId}\u0000${decision.fromOutcomeId}`;
    if (!latest.has(key)) latest.set(key, decision);
  }
  const targets: Record<string, Array<{ outcomeId: string; relation: "SAME" | "PARTIAL" | "STABLE_ID" }>> = {};
  for (const sourceOutcomeId of sourceOutcomeIds) {
    const allowed: Array<{ outcomeId: string; relation: "SAME" | "PARTIAL" | "STABLE_ID" }> = [];
    // Within one curriculum the objective id is its stable identity across versions.
    if (source.curriculumId === target.curriculumId && targetOutcomeIds.includes(sourceOutcomeId)) allowed.push({ outcomeId: sourceOutcomeId, relation: "STABLE_ID" });
    for (const targetOutcomeId of targetOutcomeIds) {
      const decision = latest.get(`${sourceOutcomeId}\u0000${targetOutcomeId}`);
      if ((decision?.relation === "SAME" || decision?.relation === "PARTIAL") && !allowed.some(item => item.outcomeId === targetOutcomeId)) allowed.push({ outcomeId: targetOutcomeId, relation: decision.relation });
    }
    targets[sourceOutcomeId] = allowed;
  }
  return { mode: "MAPPED", targets };
}

/** Every chosen mapping must be allowed by the alignment; title similarity never qualifies. */
export function alignmentIssues(alignment: ReuseAlignment, mappings: Array<{ sourceOutcomeId: string; targetOutcomeId: string }>): string[] {
  if (alignment.mode === "SAME_VERSION") return [];
  return mappings.filter(mapping => !alignment.targets[mapping.sourceOutcomeId]?.some(item => item.outcomeId === mapping.targetOutcomeId))
    .map(mapping => `Objective ${mapping.sourceOutcomeId} has no recorded same or partial mapping to ${mapping.targetOutcomeId}. A curriculum lead must record the decision in the objective map before reuse.`);
}

export type CoverageGap = { sectionId: string; sectionTitle: string; outcomeId: string | null; outcomeTitle: string | null; missingMarks: number };
/** Specific gaps instead of a readiness score: uncovered section objectives and unfilled slots, in marks. */
export function blueprintCoverageGaps(paper: PaperData, curriculum: CurriculumData): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const section of paper.blueprint.sections) {
    const questions = paper.questions.filter(question => question.sectionId === section.id);
    for (const outcomeId of section.outcomeIds) {
      if (!questions.some(question => question.outcomeIds.includes(outcomeId))) gaps.push({ sectionId: section.id, sectionTitle: section.title, outcomeId, outcomeTitle: curriculum.outcomes.find(outcome => outcome.id === outcomeId)?.title ?? outcomeId, missingMarks: section.marksPerQuestion });
    }
    const empty = section.questionCount - questions.length;
    if (empty > 0) gaps.push({ sectionId: section.id, sectionTitle: section.title, outcomeId: null, outcomeTitle: null, missingMarks: empty * section.marksPerQuestion });
  }
  return gaps;
}
