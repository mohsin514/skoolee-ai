import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { JWT_SECRET } from "@/lib/auth/secret";
import { ApiError, assertStaffRole, canManageOperations } from "@/lib/api/scope";
import { assertPermission } from "@/lib/permissions";
import { campusScope, studentScope } from "@/lib/auth/policy";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { requireMembership } from "@/lib/chat/membership";
import { getChatSettings } from "@/lib/chat/policy";
import { matchesDocumentKey } from "./document-key-scope";

export const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain"] as const;
const intentSchema = z.object({
  kind: z.enum(["student", "staff", "chat", "resource"]), targetId: z.string().min(1).max(128), storageKey: z.string().min(1).max(2048),
  contentType: z.enum(TYPES), sizeBytes: z.number().int().positive().max(MAX_PRIVATE_UPLOAD_BYTES),
});
export type PrivateUploadIntent = z.infer<typeof intentSchema>;
const actorSchema = z.object({ userId: z.string(), schoolId: z.string(), campusId: z.string().nullable(), role: z.string(), accessVersion: z.number().int().nonnegative() });
const actorOf = (user: AuthUser) => ({ userId: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role, accessVersion: user.accessVersion ?? 0 });

/** The intent chooses a destination; only a live, separately authenticated actor grants authority. */
export async function createPrivateUploadUrl(user: AuthUser, input: Omit<PrivateUploadIntent, "contentType"> & { contentType: string; fileName: string }): Promise<string> {
  const intent = intentSchema.parse(input);
  const token = await new SignJWT({ intent, actor: actorOf(user) }).setProtectedHeader({ alg: "HS256" })
    .setIssuer("skoolee-private-upload").setAudience("private-upload").setIssuedAt().setExpirationTime("15m").sign(JWT_SECRET);
  return `/api/uploads/file?intent=${encodeURIComponent(token)}`;
}

export async function verifyPrivateUploadIntent(token: string, user: AuthUser): Promise<PrivateUploadIntent> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"], issuer: "skoolee-private-upload", audience: "private-upload" });
    const actor = actorSchema.parse(payload.actor), expected = actorOf(user);
    if (Object.keys(expected).some(key => actor[key as keyof typeof actor] !== expected[key as keyof typeof expected])) throw new Error("Scope changed");
    return intentSchema.parse(payload.intent);
  } catch { throw new ApiError("This upload is unavailable. Choose the file again.", 403); }
}

export async function authorizePrivateUpload(user: AuthUser, intent: PrivateUploadIntent, db: TxClient = prisma) {
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role, accessVersion: user.accessVersion ?? 0, isActive: true }, select: { id: true } });
  if (!actor) throw new ApiError("This upload is unavailable.", 403);
  if (intent.kind === "chat") {
    if (user.role === "APP_OWNER" || !(await getChatSettings(user.schoolId, db)).attachmentsEnabled) throw new ApiError("This upload is unavailable.", 403);
    await requireMembership(user, intent.targetId, db);
    const prefix = `chat/${user.schoolId}/${intent.targetId}/`, leaf = intent.storageKey.slice(prefix.length);
    if (!intent.storageKey.startsWith(prefix) || !leaf || /[/\\\x00-\x1f]/.test(leaf) || [".", ".."].includes(leaf)) throw new ApiError("This upload is unavailable.", 403);
    return;
  }
  assertStaffRole(user);
  if (intent.kind === "resource") {
    // Learning resources (SKO-400): only the reserved file of a version this author may change.
    const { assertResourceUploadTarget } = await import("@/lib/resources/service");
    await assertResourceUploadTarget(db, user, intent.targetId, intent.storageKey);
    return;
  }
  if (intent.kind === "student") {
    await assertPermission(user, "students", "edit", db);
    const student = await db.student.findFirst({ where: { id: intent.targetId, ...studentScope(user) }, select: { id: true, campusId: true } });
    if (!student || !matchesDocumentKey(intent.storageKey, "student-docs", student.campusId, student.id)) throw new ApiError("This upload is unavailable.", 403);
  } else {
    if (!canManageOperations(user)) throw new ApiError("This upload is unavailable.", 403);
    await assertPermission(user, "staff", "edit", db);
    const staff = await db.user.findFirst({ where: { id: intent.targetId, ...campusScope(user) }, select: { id: true } });
    const campusId = intent.storageKey.split("/")[1];
    const campus = await db.campus.findFirst({ where: { id: campusId || "", schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { id: user.campusId ?? "" }) }, select: { id: true } });
    if (!staff || !campus || !matchesDocumentKey(intent.storageKey, "staff-docs", campus.id, staff.id)) throw new ApiError("This upload is unavailable.", 403);
  }
}

/** Bound both declared and streamed bytes; never buffer an unbounded request before checking. */
export async function readPrivateUploadBody(request: Request, expectedSize: number): Promise<Uint8Array> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== expectedSize)) throw new ApiError("The file size changed. Choose the file again.", 400);
  if (!request.body) throw new ApiError("Choose a file to upload.", 400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0, timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 30_000);
  try {
    while (true) {
      const next = await reader.read();
      if (timedOut) throw new ApiError("The upload took too long. Try again.", 408);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_PRIVATE_UPLOAD_BYTES || total > expectedSize) { void reader.cancel().catch(() => {}); throw new ApiError("The file exceeds its permitted size.", 413); }
      chunks.push(next.value);
    }
    if (total !== expectedSize) throw new ApiError("The upload was incomplete. Choose the file again.", 400);
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
