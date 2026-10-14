import { z } from "zod";
import { SETUP_ANSWER_KEYS, type SetupAnswerKey } from "./onboarding";
export const setupTaskCreateSchema = z.strictObject({ recordId: z.string().min(1).max(128), fieldKey: z.enum(SETUP_ANSWER_KEYS), assigneeId: z.string().min(1).max(128), instructions: z.string().trim().max(2000).default(""), idempotencyKey: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/) });
export const setupTaskUpdateSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("answer"), version: z.number().int().positive(), answer: z.string().trim().min(1).max(4000) }),
  z.strictObject({ action: z.literal("accept"), version: z.number().int().positive(), recordVersion: z.number().int().positive() }),
  z.strictObject({ action: z.literal("cancel"), version: z.number().int().positive() }),
]);
export interface SetupTask { id: string; campusId: string; recordId: string; fieldKey: SetupAnswerKey; question: string; instructions: string; requestedById: string; assigneeId: string; assigneeName: string; status: "OPEN" | "ANSWERED" | "ACCEPTED" | "CANCELLED"; answer: string | null; version: number; acceptedRecordVersion: number | null; createdAt: string; updatedAt: string; canAnswer: boolean; canManage: boolean }
export interface SetupTaskRevision { version: number; action: string; actorName: string; createdAt: string; answer: string | null }
export interface SetupTaskDetail { task: SetupTask; revisions: SetupTaskRevision[]; nextVersion: number | null; currentFact?: { value: string; recordVersion: number; status: string } }
export interface SetupTaskList { tasks: SetupTask[]; nextCursor: string | null }
export interface SetupTaskOptions { staff: { id: string; name: string; role: string }[] }
