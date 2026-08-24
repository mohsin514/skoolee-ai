import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { deleteMessage, editMessage, MAX_MESSAGE_LENGTH, requireChatUser } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editSchema = z.object({ body: z.string().min(1).max(MAX_MESSAGE_LENGTH) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    const parsed = editSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    return Response.json({ success: true, message: await editMessage(user, id, parsed.data.body) });
  } catch (error) {
    return errorResponse(error, "[chat] edit message failed");
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;
    return Response.json({ success: true, message: await deleteMessage(user, id) });
  } catch (error) {
    return errorResponse(error, "[chat] delete message failed");
  }
}
