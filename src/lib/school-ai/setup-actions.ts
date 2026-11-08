import { z } from "zod";
import { setupRoomSchema, setupPeriodSchema, setupSubjectSchema, schoolSetupProposalSchema } from "./school-setup";
export const setupActionsInput = z.strictObject({ recordId: z.string().min(1).max(128), version: z.number().int().positive(), language: z.enum(["en", "ar", "ur"]) });
const citation = { answer: z.enum(["resources", "curriculum"]), quote: z.string().trim().min(1).max(1500) };
export const setupActionsOutput = z.strictObject({
 plans: z.array(z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("ROOMS"), rows: z.array(z.strictObject({ ...citation, value: setupRoomSchema })).min(1).max(30) }),
  z.strictObject({ action: z.literal("PERIODS"), rows: z.array(z.strictObject({ ...citation, value: setupPeriodSchema })).min(1).max(30) }),
  z.strictObject({ action: z.literal("SUBJECTS"), rows: z.array(z.strictObject({ ...citation, value: setupSubjectSchema })).min(1).max(30) }),
 ])).max(3),
 questions: z.array(z.string().trim().min(1).max(300)).max(8),
}).refine(result => new Set(result.plans.map(plan => plan.action)).size === result.plans.length, "Return each action once.");
export function validateSetupActions(raw: unknown, answers: Record<string, string>, classIds: string[], reference: string) {
 const result = setupActionsOutput.parse(raw);
 const proposals = result.plans.map(plan => {
  for (const row of plan.rows) {
   if (!answers[row.answer]?.includes(row.quote)) throw new Error("A proposed row lacks exact evidence.");
   if (plan.action === "SUBJECTS" && (!('classId' in row.value) || !classIds.includes(row.value.classId))) throw new Error("Choose an existing class in this campus.");
   if ((plan.action === "SUBJECTS") !== (row.answer === "curriculum")) throw new Error("The evidence must match the setup domain.");
  }
  return schoolSetupProposalSchema.parse({ operation: "setup.apply_changes", action: plan.action, sourceReference: reference, rows: plan.rows.map(row => row.value) });
 });
 return { proposals, questions: result.questions };
}
