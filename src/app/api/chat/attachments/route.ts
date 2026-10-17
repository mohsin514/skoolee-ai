import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { requireMembership } from "@/lib/chat/membership";
import { getChatSettings } from "@/lib/chat/policy";
import { chatAttachmentKey } from "@/lib/storage/s3";
import { createPrivateUploadUrl } from "@/lib/storage/private-upload";
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_TYPES } from "@/lib/chat/attachment-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = CHAT_ATTACHMENT_TYPES;
const MAX_BYTES = CHAT_ATTACHMENT_MAX_BYTES;

const schema = z.object({
  conversationId: z.string().min(1),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

/**
 * Hands back an authenticated application PUT URL, rechecked again at upload. The
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

    // Retained membership must still satisfy current exact-class or direct policy.
    await requireMembership(user, conversationId);

    const key = chatAttachmentKey(user.schoolId, conversationId, `${randomUUID()}-${fileName}`);
    const uploadUrl = await createPrivateUploadUrl(user, { kind: "chat", targetId: conversationId, storageKey: key, contentType, sizeBytes, fileName });

    return Response.json({ success: true, storageKey: key, uploadUrl });
  } catch (error) {
    return errorResponse(error, "[chat] presign failed");
  }
}
