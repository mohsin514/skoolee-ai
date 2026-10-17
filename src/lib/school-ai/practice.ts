import { z } from "zod";
import { questionTypeSchema } from "./assessment";

// SKO-408 R18.4-R18.7: a practice set is built only from released items, never carries a key, rubric
// or model answer (no Protected_Key), and becomes visible to learners only through the ordinary
// record approval, which records the approving teacher, the time and the revision.
const id = z.string().trim().min(1).max(120);
export const practiceItemSchema = z.strictObject({
  sourceAssignmentId: id,
  questionId: id,
  prompt: z.string().min(1).max(12000),
  type: questionTypeSchema,
  options: z.array(z.strictObject({ id, text: z.string().max(2000) })).max(8),
  marks: z.number().min(0.25).max(100),
  outcomeIds: z.array(id).max(50),
});
export const practiceSetSchema = z.strictObject({
  subjectId: id,
  classId: id,
  outcomeIds: z.array(id).min(1).max(50),
  sourceAssignmentIds: z.array(id).min(1).max(5),
  items: z.array(practiceItemSchema).min(1).max(30),
  note: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.items.some(item => !value.sourceAssignmentIds.includes(item.sourceAssignmentId))) ctx.addIssue({ code: "custom", path: ["items"], message: "Every practice item comes from one of the set's released exams." });
  if (new Set(value.items.map(item => `${item.sourceAssignmentId}:${item.questionId}`)).size !== value.items.length) ctx.addIssue({ code: "custom", path: ["items"], message: "Each released item appears once." });
});
export type PracticeSet = z.infer<typeof practiceSetSchema>;
