import { createHash, createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { JWT_SECRET } from "@/lib/auth/secret";
import { ApiError } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { runUnscoped, runWithTenantContext } from "@/lib/db/tenant-context";
import { matchesFileSignature } from "@/lib/storage/file-signature";
import { deleteFile, uploadPrivateObject } from "@/lib/storage/s3";

// SKAI-1847 (Skoolee Drop): hand files from a phone to the computer you are working on.
// - The signed-in creator opens a session for one upload surface; its QR carries a signed link in the URL
//   fragment, so the capability never reaches server logs or Referer headers.
// - Holding the link only allows adding files to that one session until it expires or is closed. The phone
//   cannot read the creator's data, other sessions, or even the files it already sent.
// - Files wait in private staging (drop/{school}/{session}/…). Only the creator can fetch them, and they reach a
//   record only when the creator's page passes them to that surface's own upload, which re-checks permissions.

export const DROP_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/plain", "text/csv"] as const;
export const MAX_DROP_BYTES = 10 * 1024 * 1024;
export const MAX_DROP_FILES = 20;
export const DROP_LIFETIME_MS = 15 * 60_000;
const DROP_SECRET = createHmac("sha256", JWT_SECRET).update("skoolee-drop-v1").digest();
const AUDIENCE = "skoolee-drop";

export const createDropSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  accept: z.array(z.enum(DROP_TYPES)).min(1).max(DROP_TYPES.length),
  maxFiles: z.number().int().min(1).max(MAX_DROP_FILES).default(10),
});

const view = (session: { id: string; label: string; accept: string[]; maxFiles: number; status: string; expiresAt: Date }) =>
  ({ id: session.id, label: session.label, accept: session.accept, maxFiles: session.maxFiles, status: isOpen(session) ? "OPEN" : "CLOSED", expiresAt: session.expiresAt.toISOString() });
const isOpen = (session: { status: string; expiresAt: Date }) => session.status === "OPEN" && session.expiresAt.getTime() > Date.now();

export async function createDropSession(user: AuthUser, raw: unknown) {
  if (user.role === "APP_OWNER" || !user.schoolId) throw new ApiError("Phone upload is available inside a school.", 403);
  const input = createDropSchema.parse(raw);
  const session = await prisma.dropSession.create({ data: { schoolId: user.schoolId, createdById: user.userId, label: input.label, accept: [...new Set(input.accept)], maxFiles: input.maxFiles, expiresAt: new Date(Date.now() + DROP_LIFETIME_MS) } });
  const ticket = await new SignJWT({ sch: user.schoolId }).setProtectedHeader({ alg: "HS256" }).setSubject(session.id).setAudience(AUDIENCE)
    .setIssuedAt().setExpirationTime(Math.floor(session.expiresAt.getTime() / 1000)).sign(DROP_SECRET);
  return { session: view(session), ticket };
}

/** The creator's own session; anyone else (same school or not) sees "not found". */
async function ownSession(user: AuthUser, sessionId: string) {
  const session = await prisma.dropSession.findFirst({ where: { id: sessionId, schoolId: user.schoolId, createdById: user.userId } });
  if (!session) throw new ApiError("Phone upload not found", 404);
  return session;
}

export async function getDropSession(user: AuthUser, sessionId: string) {
  const session = await ownSession(user, sessionId);
  const items = await prisma.dropItem.findMany({ where: { sessionId: session.id, schoolId: user.schoolId }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true } });
  return { ...view(session), items: items.map(item => ({ ...item, createdAt: item.createdAt.toISOString() })) };
}

/** Closing stops the phone at once and removes the staged copies; the computer already holds what it took. */
export async function closeDropSession(user: AuthUser, sessionId: string) {
  const session = await ownSession(user, sessionId);
  await prisma.dropSession.update({ where: { id: session.id }, data: { status: "CLOSED" } });
  const items = await prisma.dropItem.findMany({ where: { sessionId: session.id, schoolId: user.schoolId }, select: { id: true, storageKey: true } });
  for (const item of items) await discard(item).catch(() => { /* The purge cron retries leftovers. */ });
  return view({ ...session, status: "CLOSED" });
}

async function discard(item: { id: string; storageKey: string }) {
  await deleteFile(item.storageKey);
  await prisma.dropItem.deleteMany({ where: { id: item.id } });
}

async function ownItem(user: AuthUser, sessionId: string, itemId: string) {
  const session = await ownSession(user, sessionId);
  const item = await prisma.dropItem.findFirst({ where: { id: itemId, sessionId: session.id, schoolId: user.schoolId } });
  if (!item) throw new ApiError("File not found", 404);
  return item;
}
export const dropItemForCreator = ownItem;
export async function discardDropItem(user: AuthUser, sessionId: string, itemId: string) { await discard(await ownItem(user, sessionId, itemId)); }

/** Verifies the phone's link and runs `fn` inside that school with the open session. */
export async function withPhoneSession<T>(ticket: string, fn: (session: Awaited<ReturnType<typeof loadPhoneSession>>) => Promise<T>) {
  let sessionId: string, schoolId: string;
  try {
    const { payload } = await jwtVerify(ticket.slice(0, 2000), DROP_SECRET, { algorithms: ["HS256"], audience: AUDIENCE });
    sessionId = z.string().uuid().parse(payload.sub); schoolId = z.string().min(1).parse(payload.sch);
  } catch { throw new ApiError("This phone link has expired. Show a new code on your computer.", 403, "DROP_EXPIRED"); }
  return runWithTenantContext({ schoolId }, async () => fn(await loadPhoneSession(schoolId, sessionId)));
}
async function loadPhoneSession(schoolId: string, sessionId: string) {
  const session = await prisma.dropSession.findFirst({ where: { id: sessionId, schoolId } });
  if (!session || !isOpen(session)) throw new ApiError("This phone link has expired. Show a new code on your computer.", 403, "DROP_EXPIRED");
  const count = await prisma.dropItem.count({ where: { sessionId, schoolId } });
  return { ...session, count };
}
export const phoneView = (session: Awaited<ReturnType<typeof loadPhoneSession>>) => ({ label: session.label, accept: session.accept, maxFiles: session.maxFiles, received: session.count, expiresAt: session.expiresAt.toISOString() });

const safeName = (name: string, contentType: string) => {
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv" } as Record<string, string>)[contentType]
    ?? (contentType.includes("word") ? "docx" : "xlsx");
  const base = name.normalize("NFKC").replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "scan";
  return `${base}.${ext}`;
};

/** Adds one phone file. Type, signature, size and the session's limits are all checked before storage. */
export async function addPhoneItem(session: Awaited<ReturnType<typeof loadPhoneSession>>, input: { fileName: string; contentType: string; bytes: Uint8Array }) {
  const contentType = input.contentType.split(";")[0].trim().toLowerCase();
  if (!session.accept.includes(contentType)) throw new ApiError("This file type is not accepted here.", 415);
  if (!input.bytes.length || input.bytes.length > MAX_DROP_BYTES) throw new ApiError("Files must be under 10 MB.", 413);
  if (!matchesFileSignature(contentType, input.bytes, { strictText: true })) throw new ApiError("The file content does not match its type.", 415);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const existing = await prisma.dropItem.findFirst({ where: { sessionId: session.id, schoolId: session.schoolId, sha256 }, select: { id: true } });
  if (existing) return { id: existing.id, duplicate: true };
  const full = () => new ApiError(`This upload takes up to ${session.maxFiles} files.`, 409);
  if (session.count >= session.maxFiles) throw full();
  const fileName = safeName(input.fileName, contentType);
  const storageKey = `drop/${session.schoolId}/${session.id}/${sha256.slice(0, 32)}`;
  await uploadPrivateObject(storageKey, input.bytes, contentType).catch(error => {
    if (!String((error as { name?: string })?.name ?? "").includes("PreconditionFailed")) throw new ApiError("The file could not be stored. Try again.", 503);
  });
  // Parallel uploads from the phone serialise on the session row, so the file limit and closing both hold.
  const outcome = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM drop_sessions WHERE id = ${session.id} AND school_id = ${session.schoolId} FOR UPDATE`;
    const current = await tx.dropSession.findFirst({ where: { id: session.id, schoolId: session.schoolId }, select: { status: true, expiresAt: true } });
    if (!current || !isOpen(current)) return { error: new ApiError("This phone link has expired. Show a new code on your computer.", 403, "DROP_EXPIRED") };
    const same = await tx.dropItem.findFirst({ where: { sessionId: session.id, schoolId: session.schoolId, sha256 }, select: { id: true } });
    if (same) return { id: same.id, duplicate: true };
    if (await tx.dropItem.count({ where: { sessionId: session.id, schoolId: session.schoolId } }) >= session.maxFiles) return { error: full() };
    const item = await tx.dropItem.create({ data: { schoolId: session.schoolId, sessionId: session.id, storageKey, fileName, contentType, sizeBytes: input.bytes.length, sha256 }, select: { id: true } });
    return { id: item.id, duplicate: false };
  });
  if ("error" in outcome) { await deleteFile(storageKey).catch(() => { /* The purge cron removes it. */ }); throw outcome.error; }
  return outcome;
}

/** Removes sessions an hour after they expire, staged objects first. Bounded per run; spans schools (cron only). */
export function purgeExpiredDrops(now = new Date(), limit = 200) {
  return runUnscoped("Skoolee Drop staging purge across schools", () => purge(now, limit));
}
async function purge(now: Date, limit: number) {
  const sessions = await prisma.dropSession.findMany({ where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } }, take: limit, select: { id: true, items: { select: { id: true, storageKey: true } } } });
  let removed = 0, failed = 0;
  for (const session of sessions) {
    try {
      for (const item of session.items) await deleteFile(item.storageKey);
      await prisma.dropSession.delete({ where: { id: session.id } }); removed++;
    } catch { failed++; }
  }
  return { removed, failed };
}
