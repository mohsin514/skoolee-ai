import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { prisma } from "@/lib/db/prisma";
import { getChatSettings } from "@/lib/chat/policy";
import { chatAttachmentKey, getUploadUrl } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deliberately narrow. A school messaging system is not a file host, and
// every type outside this list is one a browser might be talked into
// executing or rendering as something it is not.
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const MAX_BYTES = 10 * 1024 * 1024;

const schema = z.object({
  conversationId: z.string().min(1),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

/**
 * Hands back a presigned PUT so the browser uploads straight to storage. The
 * attachment row is only written when the message that carries it is sent, so
 * an abandoned upload leaves an orphaned object rather than a dangling record.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireChatUser();

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const { conversationId, fileName, sizeBytes } = parsed.data;
    const contentType = parsed.data.contentType.toLowerCase();

    const settings = await getChatSettings(user.schoolId);
    if (!settings.attachmentsEnabled) {
      throw new ApiError("Your school has disabled file sharing in messages", 403);
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ApiError("That file type is not allowed in messages", 400);
    }
    if (sizeBytes > MAX_BYTES) throw new ApiError("Files are limited to 10 MB", 400);

    // Presigning for a thread the caller is not in would let them write into
    // another conversation's prefix.
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.userId, leftAt: null },
      select: { id: true },
    });
    if (!membership) throw new ApiError("Conversation not found", 404);

    const key = chatAttachmentKey(user.schoolId, conversationId, `${randomUUID()}-${fileName}`);
    const uploadUrl = await getUploadUrl(key, contentType);

    return Response.json({ success: true, storageKey: key, uploadUrl });
  } catch (error) {
    return errorResponse(error, "[chat] presign failed");
  }
}
