import { z } from "zod";

const id = z.string().trim().min(1).max(120);
const draftText = (max: number) => z.string().max(max);
export const assessmentLanguageSchema = z.enum(["en", "ar", "ur"]);
export const questionTypeSchema = z.enum(["SINGLE_CHOICE", "SHORT_TEXT", "EXTENDED_TEXT"]);

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
  }).strict()).max(30),
  outcomes: z.array(z.object({
    id,
    title: draftText(1200),
    sourceId: draftText(120),
    sourcePage: draftText(80),
    taught: z.boolean(),
    included: z.boolean(),
  }).strict()).max(200),
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
export const questionSchema = z.object({
  id,
  sectionId: id,
  type: questionTypeSchema,
  prompt: draftText(12000),
  marks: z.number().min(0.25).max(100),
  options: z.array(z.object({ id, text: draftText(2000) }).strict()).max(8),
  correctOptionId: id.nullable(),
  modelAnswer: draftText(12000),
  rubric: z.array(z.object({ id, criterion: draftText(2000), marks: z.number().min(0.25).max(100) }).strict()).max(30),
  outcomeIds: z.array(id).max(50),
  sourceRefs: z.array(z.object({ sourceId: id, page: draftText(80), excerpt: draftText(3000) }).strict()).max(20),
  locked: z.boolean(),
  bankMetadata: questionBankMetadataSchema.optional(),
  reusedFrom: questionOriginSchema.optional(),
}).strict();

export const paperDataSchema = z.object({
  curriculumId: id,
  curriculumVersion: z.number().int().positive(),
  subjectId: id,
  classId: id,
  language: assessmentLanguageSchema,
  blueprint: blueprintSchema,
  questions: z.array(questionSchema).max(100),
  generation: z.object({
    kind: z.enum(["MANUAL", "AI"]),
    model: draftText(200).nullable(),
    generatedAt: z.string().datetime().nullable(),
  }).strict(),
}).strict();

export const generatePaperRequestSchema = z.object({
  curriculumId: id,
  blueprint: blueprintSchema,
  language: assessmentLanguageSchema,
  lockedQuestions: z.array(questionSchema).max(100).optional(),
}).strict();

export type CurriculumData = z.infer<typeof curriculumDataSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
export type Question = z.infer<typeof questionSchema>;
export type PaperData = z.infer<typeof paperDataSchema>;
export type AssessmentLocale = z.infer<typeof assessmentLanguageSchema>;

const unique = (values: string[]) => new Set(values).size === values.length;
const equalMarks = (a: number, b: number) => Math.abs(a - b) < 0.00001;

export function validateCurriculumApproval(curriculum: CurriculumData): string[] {
  const errors: string[] = [];
  if (!curriculum.academicYear.trim()) errors.push("Academic year is required.");
  if (!curriculum.board.trim()) errors.push("Curriculum or board is required.");
  if (!curriculum.sources.length) errors.push("Add at least one source.");
  if (!unique(curriculum.sources.map((source) => source.id))) errors.push("Source identifiers must be unique.");
  if (!unique(curriculum.outcomes.map((outcome) => outcome.id))) errors.push("Outcome identifiers must be unique.");
  for (const source of curriculum.sources) {
    if (!source.title.trim() || !source.reference.trim() || !source.excerpt.trim() || !source.approved) {
      errors.push(`Source ${source.title || source.id} needs a title, reference, readable content and confirmation.`);
    }
  }
  if (!curriculum.sources.some((source) => source.kind !== "PAST_PAPER" && source.approved)) {
    errors.push("A past paper alone cannot establish curriculum coverage; add a syllabus, textbook or approved teacher plan.");
  }
  if (!curriculum.outcomes.some((outcome) => outcome.included && outcome.taught)) errors.push("Include at least one taught outcome.");
  for (const outcome of curriculum.outcomes) {
    if (!outcome.title.trim() || !outcome.sourcePage.trim() || !curriculum.sources.some((source) => source.id === outcome.sourceId && source.approved)) {
      errors.push(`Outcome ${outcome.title || outcome.id} needs an approved source and page reference.`);
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

export function validatePaperApproval(paper: PaperData, curriculum: CurriculumData): string[] {
  const errors = [...validateCurriculumApproval(curriculum), ...validateBlueprint(paper.blueprint, curriculum)];
  if (paper.classId !== curriculum.classId || paper.subjectId !== curriculum.subjectId) errors.push("Paper and curriculum class/subject must match.");
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
    if (question.type === "SINGLE_CHOICE") {
      if (question.options.length < 2 || !unique(question.options.map((option) => option.id)) || !unique(question.options.map((option) => option.text.trim().toLocaleLowerCase())) || question.options.some((option) => !option.text.trim()) || !question.options.some((option) => option.id === question.correctOptionId)) errors.push(`Question ${question.id} needs distinct options and a valid answer key.`);
    } else if (question.options.length || question.correctOptionId !== null) {
      errors.push(`Question ${question.id}: written questions cannot contain a choice answer key.`);
    }
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

/** Provider output cannot invent an approved-bank origin; only exact pinned inputs retain it. */
export function prepareGeneratedQuestions(generated: Question[], locked: Question[]): Question[] {
  return mergeLockedQuestions(generated.map(({ reusedFrom: _unverifiedOrigin, ...question }) => question), locked);
}

export type CandidatePaper = {
  title: string; instructions: string; durationMinutes: number; totalMarks: number;
  sections: Blueprint["sections"];
  questions: Array<Pick<Question, "id" | "sectionId" | "type" | "prompt" | "marks" | "options">>;
};

/** Explicit allow-list: no rubric, model answer, correct option or source excerpt can reach candidates. */
export function candidatePaper(paper: PaperData): CandidatePaper {
  return {
    title: paper.blueprint.title,
    instructions: paper.blueprint.instructions,
    durationMinutes: paper.blueprint.durationMinutes,
    totalMarks: paper.blueprint.totalMarks,
    sections: paper.blueprint.sections.map(({ id: sectionId, title, questionCount, answerCount, marksPerQuestion, type }) => ({ id: sectionId, title, questionCount, answerCount, marksPerQuestion, type, outcomeIds: [] })),
    questions: paper.questions.map(({ id: questionId, sectionId, type, prompt, marks, options }) => ({ id: questionId, sectionId, type, prompt, marks, options: options.map(({ id: optionId, text }) => ({ id: optionId, text })) })),
  };
}
