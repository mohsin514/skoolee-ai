import { z } from "zod";

export const PROCTOR_CONSENT_VERSION = "optional-video-v1";
export const PROCTOR_CLIP_BYTES = 2 * 1024 * 1024;
export const PROCTOR_STREAM_BYTES = 128 * 1024 * 1024;
export const PROCTOR_STREAM_CLIPS = 360;
export const PROCTOR_CLIP_SECONDS = 20;
export const ProctorPolicySchema = z.object({ enabled: z.boolean().default(false), camera: z.boolean().default(false), screen: z.boolean().default(false), retentionDays: z.number().int().min(1).max(7).default(1) }).strict().refine(p => !p.enabled || p.camera || p.screen, "Choose at least one optional recording type.");
export type ProctorPolicy = z.infer<typeof ProctorPolicySchema>;
export type ProctorKind = "CAMERA" | "SCREEN";
export const ProctorStartSchema = z.object({ attemptId: z.string().min(1).max(100), kind: z.enum(["CAMERA", "SCREEN"]), clientKey: z.string().uuid(), consentVersion: z.literal(PROCTOR_CONSENT_VERSION), consent: z.literal(true) }).strict();
export const ProctorPolicyUpdateSchema = z.object({ version: z.number().int().min(1), policy: ProctorPolicySchema }).strict();
export const ProctorChangeSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("end"), sessionId: z.string().min(1).max(100) }).strict(), z.object({ action: z.literal("delete"), sessionId: z.string().min(1).max(100) }).strict(), z.object({ action: z.literal("review"), sessionId: z.string().min(1).max(100), note: z.string().trim().min(1).max(2000) }).strict()]);
export function proctorPolicy(value: unknown): ProctorPolicy { const result = ProctorPolicySchema.safeParse(value); return result.success ? result.data : { enabled: false, camera: false, screen: false, retentionDays: 1 }; }
export function proctorMimeType(value: string) { const mime = value.split(";")[0].trim().toLowerCase(); return mime === "video/webm" || mime === "video/mp4" ? mime : null; }
/** Container signatures prevent HTML/executable uploads. Media remains untrusted and is served nosniff. */
export function isProctorVideo(bytes: Uint8Array, mime: string) { return mime === "video/webm" ? bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 : mime === "video/mp4" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"; }
export type ProctorSessionView = { id: string; attemptId: string; userId: string; kind: string; status: string; consentedAt: string; retentionUntil: string; endedAt: string | null; bytes: number; clipCount: number; reviewNote: string | null; reviewedAt: string | null; student: { fullName: string; rollNo: string } | null; clips: { id: string; sequence: number; createdAt: string; bytes: number }[] };
export type ProctorView = { policy: ProctorPolicy; version: number; canConfigure: boolean; storageAvailable: boolean; nextCursor: string | null; sessions: ProctorSessionView[] };
