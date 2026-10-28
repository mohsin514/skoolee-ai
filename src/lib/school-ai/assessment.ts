import { z } from "zod";
import { paperFigureSchema, candidateFigure, figureBudgetIssues, type CandidateFigure } from "./paper-figures";
import { lessonPlanSchema, validateLessonPlan } from "./learning";

const id = z.string().trim().min(1).max(120);
const draftText = (max: number) => z.string().max(max);
export const assessmentLanguageSchema = z.enum(["en", "ar", "ur"]);
export const questionTypeSchema = z.enum(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "NUMERIC", "SHORT_TEXT", "EXTENDED_TEXT", "MATH", "CODE"]);

export const curriculumDataSchema = z.object({
  subjectId: id,
  classId: id,
  academicYear: draftText(80),
  board: draftText(200),
  sources: z.array(z.object({
    id,
    title: draftText(240),
    kind: z.enum(["SYLLABUS", "TEXTBOOK", "PAST_PAPER", "TEACHER_PLAN"]),
    reference: draftText(2000),
    excerpt: draftText(30000),
    approved: z.boolean(),
    edition: draftText(160).optional(),
    effectiveFrom: z.string().date().optional(),
    // SKO-500: the approved SOURCE revision this entry cites, so the evidence chain points at the
    // uploaded document rather than a pasted copy. Absent on entries typed by hand before SKO-500.
    sourceRecordId: id.optional(),
    sourceVersion: z.number().int().positive().optional(),
    pageRange: draftText(40).optional(),
    url: z.string().url().optional(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    rightsScope: draftText(500).optional(),
    reviewedAt: z.string().datetime().optional(),
    reviewDueAt: z.string().datetime().optional(),
  }).strict()).max(30),
  lessonPlans: z.array(lessonPlanSchema).max(50).optional(),
  sectionCoverage: z.array(z.object({
    section: id, outcomeIds: z.array(id).min(1).max(200), taughtOn: z.string().date(), confirmed: z.boolean(),
  }).strict()).max(100).optional(),
  outcomes: z.array(z.object({
    id,
    title: draftText(1200),
    sourceId: draftText(120),
    sourcePage: draftText(80),
    taught: z.boolean(),
    included: z.boolean(),
    // SKO-406: optional objective-map fields. `id` stays the stable identity across versions;
    // `code` is the external framework code, namespaced by the pack, never used to merge objectives.
    code: draftText(80).optional(),
    description: draftText(2000).optional(),
    prerequisiteIds: z.array(id).max(20).optional(),
    // SKO-500: the syllabus unit (chapter) the outcome sits in; the Syllabus Map's columns.
    unit: draftText(200).optional(),
  }).strict()).max(200),
  pack: z.object({
    packId: id.optional(),
    version: z.number().int().positive().optional(),
    authority: draftText(200),
    edition: draftText(80),
    language: assessmentLanguageSchema,
    rights: z.enum(["APPROVED", "UNDER_REVIEW", "MANUAL"]),
    examYear: draftText(20).optional(),
    teachingYear: draftText(80).optional(),
    grade: draftText(80).optional(),
    term: draftText(80).optional(),
    marks: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    choices: z.number().int().positive().optional(),
    paperRules: draftText(1000).optional(),
  }).strict().optional(),
  // SKO-500: approving this curriculum also approves the cited SOURCE revision (one approval, not two).
  approvalBundle: z.object({ sourceRecordId: id, sourceVersion: z.number().int().positive() }).strict().optional(),
  // SKO-500: "Same as last year" keeps where a curriculum was copied from.
  lineage: z.object({ clonedFromRecordId: id, clonedFromVersion: z.number().int().positive(), academicYear: draftText(80) }).strict().optional(),
}).strict();

export const blueprintSchema = z.object({
  title: draftText(240),
  durationMinutes: z.number().int().min(1).max(480),
  totalMarks: z.number().min(1).max(1000),
  instructions: draftText(6000),
  sections: z.array(z.object({
    id,
    title: draftText(240),
    questionCount: z.number().int().min(1).max(100),
    answerCount: z.number().int().min(1).max(100),
    marksPerQuestion: z.number().min(0.25).max(100),
    type: questionTypeSchema,
    outcomeIds: z.array(id).max(50),
  }).strict()).min(1).max(20),
}).strict();

export const bankDifficultySchema = z.enum(["UNSPECIFIED", "EASY", "MEDIUM", "HARD"]);
export const questionBankMetadataSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(80)).max(12),
  difficulty: bankDifficultySchema,
}).strict();
export const questionOriginSchema = z.object({
  paperId: id, paperVersion: z.number().int().positive(), questionId: id,
  curriculumId: id, curriculumVersion: z.number().int().positive(),
}).strict();

/** Per-item review state travels inside `paperData` so it is a property of the record version that
 * produced it, inheriting the existing compare-and-set, immutable revision and audit chain.
 *
 * These two schemas are declared here rather than in `item-review.ts` because `questionSchema`
 * references `itemReviewSchema` at module-evaluation time, and `item-review.ts` needs `Question` and
 * `PaperData` from this module; defining them there would make the cycle a runtime one. `item-review.ts`
 * re-exports them and owns the behaviour: `itemStateFor`, the transition rules and `applyStaleness`.
 *
 * Nothing in this file resolves an absent `review`. Absence is not a state — it means no review state
 * has been recorded — and `itemStateFor` is the single place that reads it as `DRAFT`, or as
 * `NEEDS_SOURCE` when `sourceRefs` is empty. */
export const itemReviewStateSchema = z.enum(["DRAFT", "NEEDS_SOURCE", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "APPROVED", "CHANGED_AFTER_APPROVAL"]);
export const itemReviewSchema = z.object({
  state: itemReviewStateSchema,
  itemRevision: z.number().int().min(1),
  approvedBy: z.object({ actorId: id, at: z.string().datetime(), itemRevision: z.number().int().min(1) }).strict().optional(),
  invalidated: z.array(z.object({
    artifact: z.enum(["KEY", "RUBRIC", "SEMANTIC_REVIEW", "FIGURE_CHECK", "ITEM_APPROVAL", "COVERAGE_CHECK"]),
    trigger: z.enum(["PROMPT", "OPTIONS", "MARKS", "FIGURES", "SOURCE_VERSION", "OUTCOME_MAP", "COVERAGE"]),
    actorId: id, at: z.string().datetime(),
  }).strict()).max(24),
  history: z.array(z.object({
    state: itemReviewStateSchema, actorId: id, at: z.string().datetime(), note: z.string().max(500).optional(),
  }).strict()).max(60),
}).strict();

export const questionSchema = z.object({
  id,
  sectionId: id,
  type: questionTypeSchema,
  prompt: draftText(12000),
  marks: z.number().min(0.25).max(100),
  options: z.array(z.object({ id, text: draftText(2000) }).strict()).max(8),
  correctOptionId: id.nullable(),
  correctOptionIds: z.array(id).max(8).optional(),
  numericKey: z.object({ value: z.number().finite(), tolerance: z.number().finite().min(0).max(1000000) }).strict().optional(),
  figures: z.array(paperFigureSchema).max(2).optional(),
  modelAnswer: draftText(12000),
  rubric: z.array(z.object({ id, criterion: draftText(2000), marks: z.number().min(0.25).max(100) }).strict()).max(30),
  outcomeIds: z.array(id).max(50),
  sourceRefs: z.array(z.object({ sourceId: id, page: draftText(80), excerpt: draftText(3000) }).strict()).max(20),
  locked: z.boolean(),
  bankMetadata: questionBankMetadataSchema.optional(),
  reusedFrom: questionOriginSchema.optional(),
  review: itemReviewSchema.optional(),
}).strict();

export const paperDataSchema = z.object({
  curriculumId: id,
  curriculumVersion: z.number().int().positive(),
  subjectId: id,
  classId: id,
  language: assessmentLanguageSchema,
  blueprint: blueprintSchema,
  coverageSection: id.optional(),
  resources: z.array(z.object({ id, title: draftText(200), content: draftText(20000), approved: z.boolean() }).strict()).max(10).optional(),
  questions: z.array(questionSchema).max(100),
  // SKO-500: which kind of assessment this paper is. Decides who may approve it (classroom tier) and
  // whether it needs moderation. Absent on older papers, which read as CLASS_TEST.
  examType: z.enum(["QUIZ", "CLASS_TEST", "MID_TERM", "FINAL"]).optional(),
  // SKO-500: the office paper slot this paper answers, when it was requested from the date sheet.
  slotId: id.optional(),
  generation: z.object({
    kind: z.enum(["MANUAL", "AI", "UPLOADED"]),
    model: draftText(200).nullable(),
    generatedAt: z.string().datetime().nullable(),
  }).strict(),
  // One record per (form, language), linked by shared identifiers carried here rather than by
  // multiplying `language` or `questions`, which would invalidate `candidatePaper`, the print
  // projection, the assignment snapshot and the scan path at once. `blueprintHash` is the parity key:
  // lowercase hex to match `canonicalDigest` and the existing `paperFigureSchema.sha256` convention.
  formSet: z.object({ id, label: z.enum(["A", "B", "C", "D"]), blueprintHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  itemGroupIds: z.record(id, id).optional(), // questionId -> shared item group id, joining parallel language versions
  // SKO-408 R18.8: a formative check scheduled from approved practice names that practice and the
  // released exams it follows up. It is otherwise an ordinary paper — reviewed, rehearsed, sealed
  // and assigned through the same path — and the link lets the later result sit beside the earlier.
  formativeOf: z.object({ practiceRecordId: id, sourceAssignmentIds: z.array(id).min(1).max(5), outcomeIds: z.array(id).min(1).max(50) }).strict().optional(),
  // Form-level staleness. Written by `applyStaleness` in `item-review.ts`; read by the rehearsal and
  // release gates, which own the refusal in R6.7. Absence means no rehearsal result has been recorded.
  staleness: z.object({
    rehearsalValid: z.boolean(),
    rehearsalId: id.optional(),
    invalidatedAt: z.string().datetime().optional(),
    triggeredBy: z.object({ actorId: id, change: z.string().max(120) }).strict().optional(),
  }).strict().optional(),
}).strict();

export const generatePaperRequestSchema = z.object({
  curriculumId: id,
  blueprint: blueprintSchema,
  language: assessmentLanguageSchema,
  coverageSection: id.optional(),
  lockedQuestions: z.array(questionSchema).max(100).optional(),
}).strict();

export type CurriculumData = z.infer<typeof curriculumDataSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
export type Question = z.infer<typeof questionSchema>;
export type PaperData = z.infer<typeof paperDataSchema>;
export type ItemReview = z.infer<typeof itemReviewSchema>;
export type ItemReviewState = z.infer<typeof itemReviewStateSchema>;
export type AssessmentLocale = z.infer<typeof assessmentLanguageSchema>;

const unique = (values: string[]) => new Set(values).size === values.length;
const equalMarks = (a: number, b: number) => Math.abs(a - b) < 0.00001;

/** Duplicate codes, unknown prerequisites and prerequisite cycles are explained before saving. */
export function objectiveStructureIssues(curriculum: Pick<CurriculumData, "outcomes">): string[] {
  const errors: string[] = [];
  const codes = curriculum.outcomes.flatMap(outcome => outcome.code?.trim() ? [outcome.code.trim().toLowerCase()] : []);
  if (!unique(codes)) errors.push("Objective codes must be unique within a curriculum version.");
  const ids = new Set(curriculum.outcomes.map(outcome => outcome.id));
  for (const outcome of curriculum.outcomes) {
    for (const prerequisite of outcome.prerequisiteIds ?? []) {
      if (prerequisite === outcome.id) errors.push(`Objective ${outcome.code || outcome.id} cannot be its own prerequisite.`);
      else if (!ids.has(prerequisite)) errors.push(`Objective ${outcome.code || outcome.id} has a prerequisite that is not in this curriculum.`);
    }
  }
  const state = new Map<string, "visiting" | "done">();
  const edges = new Map(curriculum.outcomes.map(outcome => [outcome.id, outcome.prerequisiteIds ?? []]));
  const visit = (node: string): boolean => {
    if (state.get(node) === "done") return false;
    if (state.get(node) === "visiting") return true;
    state.set(node, "visiting");
    const cyclic = (edges.get(node) ?? []).some(next => next !== node && ids.has(next) && visit(next));
    state.set(node, "done");
    return cyclic;
  };
  if (curriculum.outcomes.some(outcome => visit(outcome.id))) errors.push("Prerequisites form a cycle; remove one link so every objective can be taught in order.");
  return errors;
}

export function validateCurriculumApproval(curriculum: CurriculumData): string[] {
  const errors: string[] = [];
  if (!curriculum.academicYear.trim()) errors.push("Academic year is required.");
  if (!curriculum.board.trim()) errors.push("Curriculum or board is required.");
  if (!curriculum.sources.length) errors.push("Add at least one source.");
  if (curriculum.pack && (!curriculum.pack.packId || !curriculum.pack.version)) errors.push("Versioned packs require an immutable pack ID and version.");
  if (curriculum.pack?.authority.toLowerCase().includes("fbise") && !curriculum.pack.examYear) errors.push("FBISE packs require an exam year.");
  if (curriculum.pack?.examYear && curriculum.pack.teachingYear && curriculum.pack.examYear === curriculum.pack.teachingYear) errors.push("Exam year must remain distinct from teaching year.");
  if (curriculum.pack?.rights === "APPROVED" && curriculum.sources.some(source => !source.url || !source.checksum || !source.rightsScope || !source.reviewedAt)) errors.push("Approved pack sources need URL, checksum, rights scope and review metadata.");
  if (!unique(curriculum.sources.map((source) => source.id))) errors.push("Source identifiers must be unique.");
  if (!unique(curriculum.outcomes.map((outcome) => outcome.id))) errors.push("Outcome identifiers must be unique.");
  for (const source of curriculum.sources) {
    if (!source.title.trim() || !source.reference.trim() || !source.excerpt.trim() || !source.approved) {
      errors.push(`Source ${source.title || source.id} needs a title, reference, readable content and confirmation.`);
    }
    if (source.reviewDueAt && source.reviewDueAt < new Date().toISOString()) errors.push(`Source ${source.title || source.id} is stale and must be reviewed before publication.`);
  }
  if (!curriculum.sources.some((source) => source.kind !== "PAST_PAPER" && source.approved)) {
    errors.push("A past paper alone cannot establish curriculum coverage; add a syllabus, textbook or approved teacher plan.");
  }
  // SKO-500: a syllabus drawn from an uploaded source records teaching on the Teaching Line, so it is
  // approved before anything is taught. A hand-typed curriculum still needs one taught outcome.
  const tracksTeachingLine = curriculum.sources.some((source) => source.sourceRecordId);
  if (!tracksTeachingLine && !curriculum.outcomes.some((outcome) => outcome.included && outcome.taught)) errors.push("Include at least one taught outcome.");
  if (tracksTeachingLine && !curriculum.outcomes.some((outcome) => outcome.included)) errors.push("Include at least one outcome.");
  for (const outcome of curriculum.outcomes) {
    if (!outcome.title.trim() || !outcome.sourcePage.trim() || !curriculum.sources.some((source) => source.id === outcome.sourceId && source.approved)) {
      errors.push(`Outcome ${outcome.title || outcome.id} needs an approved source and page reference.`);
    }
  }
  errors.push(...objectiveStructureIssues(curriculum));
  if (curriculum.lessonPlans) {
    if (!unique(curriculum.lessonPlans.map(plan => plan.id))) errors.push("Learning plan identifiers must be unique.");
    for (const plan of curriculum.lessonPlans) { errors.push(...validateLessonPlan(plan, curriculum)); if (!plan.confirmed) errors.push(`Learning plan ${plan.title} needs teacher confirmation.`); }
  }
  if (curriculum.sectionCoverage) {
    if (!unique(curriculum.sectionCoverage.map(row => row.section))) errors.push("Coverage sections must be unique.");
    for (const row of curriculum.sectionCoverage) {
      if (!row.confirmed || !unique(row.outcomeIds) || row.outcomeIds.some(outcomeId => !curriculum.outcomes.some(outcome => outcome.id === outcomeId && outcome.taught))) errors.push(`Section ${row.section}: confirm distinct taught curriculum outcomes.`);
    }
  }
  return errors;
}

export function validateBlueprint(blueprint: Blueprint, curriculum?: CurriculumData): string[] {
  const errors: string[] = [];
  if (!blueprint.title.trim()) errors.push("Paper title is required.");
  if (!unique(blueprint.sections.map((section) => section.id))) errors.push("Section identifiers must be unique.");
  if (blueprint.sections.reduce((sum, section) => sum + section.questionCount, 0) > 100) errors.push("A paper can contain at most 100 questions.");
  if (!equalMarks(blueprint.sections.reduce((sum, section) => sum + section.answerCount * section.marksPerQuestion, 0), blueprint.totalMarks)) {
    errors.push("Total marks must equal the marks for the required answers in every section.");
  }
  for (const section of blueprint.sections) {
    if (!section.title.trim()) errors.push("Each section needs a title.");
    if (section.answerCount > section.questionCount) errors.push(`${section.title}: required answers exceed available questions.`);
    if (!section.outcomeIds.length || !unique(section.outcomeIds)) errors.push(`${section.title}: select distinct learning outcomes.`);
    if (curriculum && section.outcomeIds.some((outcomeId) => !curriculum.outcomes.some((outcome) => outcome.id === outcomeId && outcome.included && outcome.taught))) {
      errors.push(`${section.title}: only included, taught outcomes can be assessed.`);
    }
  }
  return errors;
}

/** The item-review-state check (R4.10) and the figure-staleness check (R6.2), both read from the
 * item's own recorded `review` and from nothing else.
 *
 * A paper that carries no recorded review state at all is governed entirely by the deterministic
 * checks around this one, which is what keeps every row stored before the item workbench existed
 * approvable without a migration. The moment any item of the paper carries a review state, the paper
 * is under the workbench and every item must carry one and be approved — so a half-reviewed paper
 * cannot be approved on the strength of its unreviewed items. */
function itemReviewIssues(paper: PaperData): string[] {
  if (!paper.questions.some((question) => question.review)) return [];
  const errors: string[] = [];
  const unapproved = paper.questions.filter((question) => question.review?.state !== "APPROVED");
  if (unapproved.length) {
    const named = unapproved.slice(0, 10).map((question) => question.id).join(", ");
    errors.push(`Approve every item before approving the paper. Not approved: ${named}${unapproved.length > 10 ? ` and ${unapproved.length - 10} more` : ""}.`);
  }
  for (const question of paper.questions) {
    const review = question.review;
    if (!review) continue;
    // A figure change invalidates that item's figure completeness check and its approval. The figure's
    // own `approved` flag cannot express this: a re-cropped figure keeps it, so the recorded
    // invalidation is the only evidence that the reviewed check belongs to an earlier item revision.
    const staleFigure = review.invalidated.find((entry) => entry.artifact === "FIGURE_CHECK" || entry.trigger === "FIGURES");
    if (staleFigure) errors.push(`Question ${question.id}: a ${staleFigure.trigger.toLocaleLowerCase()} change invalidated the figure check at ${staleFigure.at}. Review the figure again before approval.`);
    // An approval recorded against an earlier item revision is not an approval of this item.
    if (review.state === "APPROVED" && review.approvedBy?.itemRevision !== review.itemRevision) errors.push(`Question ${question.id}: the recorded approval belongs to an earlier item revision.`);
  }
  return errors;
}

export function validatePaperApproval(paper: PaperData, curriculum: CurriculumData): string[] {
  const errors = [...validateCurriculumApproval(curriculum), ...validateBlueprint(paper.blueprint, curriculum)];
  if (paper.classId !== curriculum.classId || paper.subjectId !== curriculum.subjectId) errors.push("Paper and curriculum class/subject must match.");
  if (curriculum.sectionCoverage?.length) {
    const coverage = curriculum.sectionCoverage.find(row => row.section === paper.coverageSection && row.confirmed);
    if (!coverage || paper.blueprint.sections.some(section => section.outcomeIds.some(outcomeId => !coverage.outcomeIds.includes(outcomeId)))) errors.push("Choose a confirmed section coverage containing every assessed outcome.");
  }
  if (paper.resources?.some(resource => !resource.title.trim() || !resource.content.trim() || !resource.approved) || (paper.resources && !unique(paper.resources.map(resource => resource.id)))) errors.push("Every candidate resource needs a distinct identifier, title, content and explicit approval.");
  errors.push(...figureBudgetIssues(paper.questions.flatMap(question=>question.figures??[])));
  if (paper.questions.some(question=>question.figures?.some(figure=>!figure.approved||!figure.alt.trim()))) errors.push("Review each candidate figure and add accessible alternative text before approval.");
  errors.push(...itemReviewIssues(paper));
  if (!unique(paper.questions.map((question) => question.id))) errors.push("Question identifiers must be unique.");
  const prompts = paper.questions.map((question) => question.prompt.trim().toLocaleLowerCase().replace(/\s+/g, " "));
  if (!unique(prompts)) errors.push("Duplicate question prompts must be reviewed.");
  for (const section of paper.blueprint.sections) {
    const questions = paper.questions.filter((question) => question.sectionId === section.id);
    if (questions.length !== section.questionCount) errors.push(`${section.title}: question count does not match the blueprint.`);
    if (questions.some((question) => question.type !== section.type || !equalMarks(question.marks, section.marksPerQuestion))) errors.push(`${section.title}: question type or marks do not match the blueprint.`);
    if (section.outcomeIds.some((outcomeId) => !questions.some((question) => question.outcomeIds.includes(outcomeId)))) errors.push(`${section.title}: learning-outcome coverage is incomplete.`);
  }
  for (const question of paper.questions) {
    const section = paper.blueprint.sections.find((item) => item.id === question.sectionId);
    if (!section) errors.push(`Question ${question.id} refers to an unknown section.`);
    if (!question.prompt.trim()) errors.push(`Question ${question.id} has no prompt.`);
    if (!question.outcomeIds.length || !unique(question.outcomeIds) || question.outcomeIds.some((outcomeId) => !section?.outcomeIds.includes(outcomeId))) errors.push(`Question ${question.id} needs valid section outcomes.`);
    if (!question.sourceRefs.length || question.sourceRefs.some((ref) => !ref.page.trim() || !ref.excerpt.trim() || !curriculum.sources.some((source) => source.id === ref.sourceId && source.approved && source.excerpt.includes(ref.excerpt)))) errors.push(`Question ${question.id} needs source evidence quoted from the approved material.`);
    if (question.sourceRefs.some((ref) => !curriculum.outcomes.some((outcome) => question.outcomeIds.includes(outcome.id) && outcome.sourceId === ref.sourceId && outcome.sourcePage === ref.page))) errors.push(`Question ${question.id} cites a page outside its mapped curriculum outcomes.`);
    if (question.outcomeIds.some((outcomeId) => {
      const outcome = curriculum.outcomes.find((item) => item.id === outcomeId);
      return !outcome || !question.sourceRefs.some((ref) => ref.sourceId === outcome.sourceId && ref.page === outcome.sourcePage);
    })) errors.push(`Question ${question.id} evidence must support its learning outcomes.`);
    if (question.type === "SINGLE_CHOICE" || question.type === "MULTIPLE_CHOICE") {
      if (question.options.length < 2 || !unique(question.options.map((option) => option.id)) || !unique(question.options.map((option) => option.text.trim().toLocaleLowerCase())) || question.options.some((option) => !option.text.trim()) || (question.type === "SINGLE_CHOICE" && !question.options.some((option) => option.id === question.correctOptionId))) errors.push(`Question ${question.id} needs distinct options and a valid answer key.`);
    } else if (question.options.length || question.correctOptionId !== null) {
      errors.push(`Question ${question.id}: written questions cannot contain a choice answer key.`);
    }
    if (question.type === "MULTIPLE_CHOICE" && (question.correctOptionId !== null || !question.correctOptionIds?.length || !unique(question.correctOptionIds) || question.correctOptionIds.some(optionId => !question.options.some(option => option.id === optionId)))) errors.push(`Question ${question.id} needs distinct valid correct choices.`);
    if (question.type !== "MULTIPLE_CHOICE" && question.correctOptionIds?.length) errors.push(`Question ${question.id}: multiple-choice keys belong only to multiple-choice questions.`);
    if (question.type === "NUMERIC" && !question.numericKey) errors.push(`Question ${question.id} needs a numeric answer and tolerance.`);
    if (question.type !== "NUMERIC" && question.numericKey) errors.push(`Question ${question.id}: numeric keys belong only to numeric questions.`);
    if (!question.modelAnswer.trim()) errors.push(`Question ${question.id} needs a model answer.`);
    if (!question.rubric.length || !unique(question.rubric.map((criterion) => criterion.id)) || question.rubric.some((criterion) => !criterion.criterion.trim()) || !equalMarks(question.rubric.reduce((sum, criterion) => sum + criterion.marks, 0), question.marks)) errors.push(`Question ${question.id}: rubric criteria must total the question marks.`);
  }
  return [...new Set(errors)];
}

/** Preserve exact locked items; a model response cannot rewrite a teacher's pinned decisions. */
export function mergeLockedQuestions(generated: Question[], locked: Question[]): Question[] {
  const pinned = new Map(locked.filter((question) => question.locked).map((question) => [question.id, question]));
  const result = generated.map((question) => pinned.get(question.id) ?? question);
  for (const question of pinned.values()) if (!result.some((item) => item.id === question.id)) result.push(question);
  return result;
}

/** Provider output cannot invent an approved-bank origin, a reviewed figure or an item approval;
 * only exact pinned inputs retain them. A generated item arrives with no recorded review state, which
 * the item workbench reads as `DRAFT`. */
export function prepareGeneratedQuestions(generated: Question[], locked: Question[]): Question[] {
  return mergeLockedQuestions(generated.map(({ reusedFrom: _unverifiedOrigin, figures: _unverifiedFigures, review: _unverifiedReview, ...question }) => question), locked);
}

export type CandidatePaper = {
  title: string; instructions: string; durationMinutes: number; totalMarks: number;
  sections: Blueprint["sections"];
  resources?: Array<{ id: string; title: string; content: string }>;
  questions: Array<Pick<Question, "id" | "sectionId" | "type" | "prompt" | "marks" | "options"> & {figures?:CandidateFigure[]}>;
};

/** Explicit allow-list: no rubric, model answer, correct option or source excerpt can reach candidates. */
export function candidatePaper(paper: PaperData): CandidatePaper {
  return {
    title: paper.blueprint.title,
    instructions: paper.blueprint.instructions,
    durationMinutes: paper.blueprint.durationMinutes,
    totalMarks: paper.blueprint.totalMarks,
    sections: paper.blueprint.sections.map(({ id: sectionId, title, questionCount, answerCount, marksPerQuestion, type }) => ({ id: sectionId, title, questionCount, answerCount, marksPerQuestion, type, outcomeIds: [] })),
    ...(paper.resources?.length ? { resources: paper.resources.filter(resource => resource.approved).map(({ id, title, content }) => ({ id, title, content })) } : {}),
    questions: paper.questions.map(({ id: questionId, sectionId, type, prompt, marks, options, figures }) => ({ id: questionId, sectionId, type, prompt, marks, options: options.map(({ id: optionId, text }) => ({ id: optionId, text })), ...(figures?.length ? {figures:figures.filter(figure=>figure.approved).map(candidateFigure)} : {}) })),
  };
}

/**
 * SKO-501 (audit 4.4, `assessment-studio.tsx:195`): "Create revised draft" from a reviewed, rehearsed,
 * form-set or requested paper. A new record may not carry another record's review history, form-set
 * membership, rehearsal state or paper request, so the revised draft drops exactly those and keeps the
 * content (bank provenance included). Every item starts unreviewed, so review and rehearsal run again.
 */
export function revisedDraftFrom(paper: PaperData): PaperData {
  const { formSet: _formSet, itemGroupIds: _groups, staleness: _staleness, slotId: _slot, ...rest } = paper;
  return { ...rest, questions: paper.questions.map(({ review: _review, ...question }) => question) };
}
