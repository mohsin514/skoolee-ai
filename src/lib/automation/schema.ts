import { assistantCatalogQuerySchema } from "@/lib/school-ai/assistant-catalog";
import { campusCreateSchema, libraryCreateSchema, phoneCallSchema, personalPlanSchema, studentsCreateSchema, platformInspectSchema, platformUpdateSchema } from "./role-actions";
import { z } from "zod";
import { workflowDataSchema } from "@/lib/school-ai/schemas";
import { curriculumDataSchema } from "@/lib/school-ai/assessment";
const id = z.string().min(1).max(128);
export const automationStartSchema = z.strictObject({ message: z.string().trim().min(1).max(24000), intent: z.enum(["setup", "workflow"]).optional(), campusId: id.nullable().optional(), language: z.enum(["en", "ar", "ur"]), idempotencyKey: z.string().min(8).max(128).regex(/^[\w-]+$/), questionnaire: z.strictObject({ id, version: z.number().int().positive() }).optional() });
export const automationContinueSchema = z.strictObject({ version: z.number().int().positive(), action: z.enum(["advance", "answer", "pause", "resume"]), answer: z.string().trim().min(1).max(8000).optional() });
export const profileActionSchema = z.strictObject({ fullName: z.string().trim().min(2).max(120).optional(), preferredLanguage: z.enum(["en", "ar", "ur"]).optional(), city: z.string().trim().max(120).optional(), qualification: z.string().trim().max(200).optional(), specialization: z.string().trim().max(200).optional(), subjectSpecialties: z.array(z.string().trim().min(1).max(100)).max(30).optional(), experience: z.string().trim().max(100).optional() }).refine(value => Object.keys(value).length > 0, "Provide at least one profile field.");
export const automaticActionSchema = z.discriminatedUnion("tool", [
 z.strictObject({ tool: z.literal("platform.inspect"), title: z.string().min(1).max(180), data: platformInspectSchema }),
 z.strictObject({ tool: z.literal("platform.update_institution"), title: z.string().min(1).max(180), data: platformUpdateSchema }),
 z.strictObject({ tool: z.literal("school.inspect"), title: z.string().min(1).max(180), data: assistantCatalogQuerySchema }),
 z.strictObject({ tool: z.literal("students.create"), title: z.string().min(1).max(180), data: studentsCreateSchema }),
 z.strictObject({ tool: z.literal("campus.create"), title: z.string().min(1).max(180), data: campusCreateSchema }),
 z.strictObject({ tool: z.literal("library.create_books"), title: z.string().min(1).max(180), data: libraryCreateSchema }),
 z.strictObject({ tool: z.literal("front_desk.log_call"), title: z.string().min(1).max(180), data: phoneCallSchema }),
 z.strictObject({ tool: z.literal("personal.save_plan"), title: z.string().min(1).max(180), data: personalPlanSchema }),
 z.strictObject({ tool: z.literal("school.execute"), title: z.string().trim().min(1).max(180), data: workflowDataSchema }),
 z.strictObject({ tool: z.literal("curriculum.create"), title: z.string().trim().min(1).max(180), data: curriculumDataSchema }),
 z.strictObject({ tool: z.literal("profile.update"), title: z.string().trim().min(1).max(180), data: profileActionSchema }),
 z.strictObject({ tool: z.literal("work.save"), title: z.string().trim().min(1).max(180), data: workflowDataSchema }),
]);
export type AutomaticAction = z.infer<typeof automaticActionSchema>;
export const automaticDecisionSchema = z.discriminatedUnion("type", [
 z.strictObject({ type: z.literal("act"), evidenceQuote: z.string().trim().min(1).max(2000), action: automaticActionSchema }),
 z.strictObject({ type: z.literal("ask"), question: z.string().trim().min(1).max(1500) }),
 z.strictObject({ type: z.literal("complete"), outcome: z.enum(["executed", "answered", "plan_saved"]).default("executed"), summary: z.string().trim().min(1).max(2000) }),
 z.strictObject({ type: z.literal("unsupported"), reason: z.string().trim().min(1).max(2000) }),
]);
export interface AutomaticJob {
 id: string; version: number; status: "RUNNING" | "WAITING_INPUT" | "PAUSED" | "COMPLETED" | "FAILED" | "BLOCKED";
 role: string; campusId: string | null; language: "en" | "ar" | "ur"; request: string;
 messages: string[]; conversation?: Array<{ question: string; answer: string }>; question: string | null; summary: string | null;
 steps: Array<{ key: string; title: string; tool: string; receipt: Record<string, unknown> }>;
 pending: AutomaticAction | null; pendingKey: string | null; error: string | null; createdAt: string;
 questionnaire?: { id: string; version: number }; accessVersion: number; outcome?: "executed" | "answered" | "plan_saved";
}
export const automaticSelectionSchema = z.discriminatedUnion("type", [
 z.strictObject({ type: z.literal("select"), tool: z.string().min(1).max(80), operation: z.string().max(80).nullable().optional() }),
 z.strictObject({ type: z.literal("ask"), question: z.string().trim().min(1).max(1500) }),
 z.strictObject({ type: z.literal("complete"), outcome: z.enum(["executed", "answered", "plan_saved"]).default("executed"), summary: z.string().trim().min(1).max(2000) }),
 z.strictObject({ type: z.literal("unsupported"), reason: z.string().trim().min(1).max(2000) }),
]);
