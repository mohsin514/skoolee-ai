import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { AccessDenied, campusScope } from "@/lib/auth/policy";
import { requireMembership } from "./membership";
import { privateDownloadResponse, type PrivateObjectReader } from "@/lib/storage/private-download";

/** A known attachment id grants nothing without a live account, membership and relationship. */
export async function authorizeChatAttachment(user: AuthUser, attachmentId: string, db: TxClient = prisma) {
  if (user.role === "APP_OWNER") throw new AccessDenied("attachment");
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true, role: user.role, campusId: user.campusId, ...(user.accessVersion === undefined ? {} : { accessVersion: user.accessVersion }) }, select: { id: true } });
  if (!actor) throw new AccessDenied("attachment");
  const attachment = await db.chatAttachment.findFirst({ where: { id: attachmentId, schoolId: user.schoolId, message: { schoolId: user.schoolId, deletedAt: null, conversation: campusScope(user) } }, include: { message: { select: { conversationId: true } } } });
  if (!attachment) throw new AccessDenied("attachment");
  try { await requireMembership(user, attachment.message.conversationId, db); }
  catch (error) { if (error instanceof Error && "status" in error && error.status === 404) throw new AccessDenied("attachment"); throw error; }
  const prefix = `chat/${user.schoolId}/${attachment.message.conversationId}/`;
  const leaf = attachment.storageKey.slice(prefix.length);
  if (!attachment.storageKey.startsWith(prefix) || !leaf || /[/\\\x00]/.test(leaf) || leaf === "." || leaf === "..") throw new AccessDenied("attachment");
  return attachment;
}

export async function downloadChatAttachment(user: AuthUser, attachmentId: string, db: TxClient = prisma, read?: PrivateObjectReader) {
  const attachment = await authorizeChatAttachment(user, attachmentId, db);
  return privateDownloadResponse(attachment.storageKey, attachment.fileName, { contentType: attachment.contentType, inlineImage: true }, read);
}
