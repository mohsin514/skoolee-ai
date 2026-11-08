import { z } from "zod";
import type { AssistantTurn } from "./assistant-context";

const id = z.string().min(1).max(128);
export const conversationCreateSchema = z.strictObject({ title: z.string().trim().min(1).max(180), purpose: z.enum(["WORKSPACE", "SETUP"]).default("WORKSPACE"), topicKey: z.string().min(1).max(80).optional(), campusId: id.nullable().optional(), subjectId: id.optional(), classId: id.optional(), idempotencyKey: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/) }).refine(value => Boolean(value.subjectId) === Boolean(value.classId), { message: "Choose both subject and class." });
export const conversationUpdateSchema = z.strictObject({ version: z.number().int().nonnegative(), action: z.enum(["archive", "resume"]) });
export interface PrivateConversation { id: string; title: string; purpose: "WORKSPACE" | "SETUP"; topicKey: string | null; campusId: string | null; subjectId: string | null; classId: string | null; version: number; archivedAt: string | null; createdAt: string; updatedAt: string }
export interface PrivateExchange { id: string; version: number; createdAt: string; hidden: boolean; turns?: [AssistantTurn, AssistantTurn]; recordId?: string }
export interface ConversationRecovery { catalog?: import("./assistant-catalog").AssistantCatalogSelection; key: string; message: string; language: "en" | "ar" | "ur"; version: number; status: "PENDING" | "FAILED"; leaseExpiresAt: string | null }
export interface PrivateConversationPage { conversation: PrivateConversation; exchanges: PrivateExchange[]; nextVersion: number | null; recovery: ConversationRecovery | null }
export interface PrivateConversationList { conversations: PrivateConversation[]; nextCursor: string | null }
