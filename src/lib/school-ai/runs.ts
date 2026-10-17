import { z } from "zod";
import { SCHOOL_AI_OPERATION_NAMES } from "./operations";

export const runStepSchema = z.strictObject({ recordId: z.string().min(1).max(128), version: z.number().int().positive(), operation: z.enum(SCHOOL_AI_OPERATION_NAMES), previewHash: z.string().regex(/^[a-f0-9]{64}$/) });
export const runStepsSchema = z.array(runStepSchema).min(1).max(20).refine(steps => new Set(steps.map(s => `${s.recordId}:${s.version}:${s.operation}`)).size === steps.length, "Choose each approved action once.");
export const runCreateSchema = z.strictObject({ title: z.string().trim().min(1).max(180), campusId: z.string().min(1).max(128), steps: runStepsSchema, policyId: z.string().min(1).max(128).optional(), scheduledAt: z.iso.datetime(), expiresAt: z.iso.datetime(), idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/) });
export const runUpdateSchema = z.strictObject({ version: z.number().int().positive(), action: z.enum(["pause", "resume", "cancel"]) });
export const automationPolicySchema = z.strictObject({ enabled: z.boolean(), operations: z.array(z.enum(SCHOOL_AI_OPERATION_NAMES)).max(30), expiresAt: z.iso.datetime(), maxRuns: z.number().int().min(1).max(100), maxActions: z.number().int().min(1).max(1000) }).refine(value => !value.enabled || value.operations.length > 0, "Choose at least one allowed action.").refine(value => new Set(value.operations).size === value.operations.length, "Choose each action once.");
export type RunStep = z.infer<typeof runStepSchema>;
export interface SchoolRun { id: string; title: string; campusId: string; status: "QUEUED" | "PAUSED" | "BLOCKED" | "COMPLETED" | "CANCELLED" | "EXPIRED"; version: number; steps: RunStep[]; nextStep: number; receipts: Array<{ id: string; operation: string; recordId: string; version: number }>; errorCode: string | null; scheduledAt: string; expiresAt: string; createdAt: string; completedAt: string | null; updatedAt?: string; owner?: { name: string; mine: boolean }; committedAt?: Record<string, string> }
export function validateRunWindow(scheduled: Date, expires: Date, now: Date) {
  if (!Number.isFinite(scheduled.getTime()) || !Number.isFinite(expires.getTime()) || expires <= scheduled || expires <= now || scheduled.getTime() > now.getTime() + 30 * 86400000 || expires.getTime() - scheduled.getTime() > 30 * 86400000) throw Object.assign(new Error("Choose a future expiry within 30 days of the scheduled start."), { status: 422 });
}
export function operationPolicyScope(operation: string) { return operation.startsWith("fees.") || operation.startsWith("finance.") ? "finance" : operation.startsWith("communications.") ? "communications" : "academics"; }
