import { z } from "zod";
import { SETUP_ANSWER_KEYS, validateSetupAnswer, type SetupAnswers } from "./onboarding";

export const setupAnalysisInput = z.strictObject({
  campusId: z.string().min(1).max(128),
  language: z.enum(["en", "ar", "ur"]),
  text: z.string().trim().max(8000),
  sources: z.array(z.strictObject({ id: z.string().min(1).max(128), version: z.number().int().positive() })).max(5),
}).refine(input => input.text.length > 0 || input.sources.length > 0, "Provide an answer or a reviewed document.")
  .refine(input => new Set(input.sources.map(source => source.id)).size === input.sources.length, "Choose each source once.");
export const setupAnalysisOutput = z.strictObject({
  answers: z.array(z.strictObject({ key: z.enum(SETUP_ANSWER_KEYS), value: z.string().trim().min(1).max(1500), evidenceId: z.string().min(1).max(128), quote: z.string().trim().min(1).max(600) })).max(18),
  questions: z.array(z.string().trim().min(1).max(300)).max(8),
}).refine(value => new Set(value.answers.map(answer => answer.key)).size === value.answers.length, "Each answer must be proposed once.");
export type SetupAnalysis = z.infer<typeof setupAnalysisOutput>;
export interface SetupEvidence { id: string; text: string }

/** Evidence must be verbatim from this request. Model text never confirms an answer or executes work. */
export function validateSetupAnalysis(raw: unknown, evidence: SetupEvidence[]): SetupAnalysis {
  const result = setupAnalysisOutput.parse(raw);
  const facts = Object.fromEntries(result.answers.map(answer => [answer.key, answer.value])) as SetupAnswers;
  for (const answer of result.answers) {
    const source = evidence.find(item => item.id === answer.evidenceId);
    if (!source || !source.text.includes(answer.quote)) throw new Error("The proposed answer has no matching source evidence.");
    if (validateSetupAnswer(answer.key, answer.value, facts)) throw new Error("The proposed answer needs correction before it can be used.");
  }
  return result;
}

/** Keep independently supported suggestions; never let one fabricated citation hide useful facts. */
export function reconcileSetupAnalysis(raw: unknown, evidence: SetupEvidence[], language: "en" | "ar" | "ur"): SetupAnalysis {
  const parsed = setupAnalysisOutput.parse(raw);
  let answers = parsed.answers.filter(answer => {
    try { validateSetupAnalysis({ answers: [answer], questions: [] }, evidence); return true; }
    catch { return false; }
  });
  const start = answers.find(answer => answer.key === "startDate"), end = answers.find(answer => answer.key === "endDate");
  if (start && end && start.value > end.value) answers = answers.filter(answer => answer.key !== "startDate" && answer.key !== "endDate");
  const unsupported = {
    en: "Some suggestions could not be verified against your explanation. Please supply the missing details directly in the questionnaire or clarify your explanation.",
    ar: "تعذر التحقق من بعض الاقتراحات وفق شرحك. أدخل التفاصيل الناقصة في الاستبيان أو وضح شرحك.",
    ur: "کچھ تجاویز کی آپ کی وضاحت سے تصدیق نہیں ہوسکی۔ نامکمل تفصیلات سوالنامے میں درج کریں یا اپنی وضاحت واضح کریں۔",
  };
  return validateSetupAnalysis({ answers, questions: answers.length < parsed.answers.length ? [unsupported[language], ...parsed.questions].slice(0, 8) : parsed.questions }, evidence);
}
