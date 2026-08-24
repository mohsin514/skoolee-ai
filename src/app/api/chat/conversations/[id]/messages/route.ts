import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { listMessages, MAX_MESSAGE_LENGTH, requireChatUser, sendMessage } from "@/lib/chat/service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  body: z.string().max(MAX_MESSAGE_LENGTH).default(""),
  replyToId: z.string().min(1).optional(),
  clientKey: z.string().min(1).max(100).optional(),
  attachments: z
    .array(
      z.object({
        storageKey: z.string().min(1),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive(),
      })
    )
    .max(5)
    .optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);

    const page = await listMessages(user, id, {
      cursor: searchParams.get("cursor") ?? undefined,
      limit: Number(searchParams.get("limit")) || undefined,
    });

    return Response.json({ success: true, ...page });
  } catch (error) {
    return errorResponse(error, "[chat] list messages failed");
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    // A chat endpoint is the easiest write path in the product to abuse —
    // scripted or accidental — so it is capped per sender rather than relying
    // on the UI to behave.
    const limit = rateLimit(`chat:send:${user.userId}`, { limit: 40, windowMs: 60_000 });
    if (!limit.ok) {
      throw new ApiError("You are sending messages too quickly. Wait a moment.", 429);
    }

    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const message = await sendMessage(user, id, parsed.data);
    return Response.json({ success: true, message });
  } catch (error) {
    return errorResponse(error, "[chat] send message failed");
  }
}
