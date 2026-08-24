import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import { addMembers, getConversation, removeMember, requireChatUser } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const addSchema = z.object({ userIds: z.array(z.string().min(1)).min(1).max(100) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    const parsed = addSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    return Response.json({
      success: true,
      conversation: await addMembers(user, id, parsed.data.userIds),
    });
  } catch (error) {
    return errorResponse(error, "[chat] add members failed");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    const targetUserId = new URL(req.url).searchParams.get("userId");
    if (!targetUserId) throw new ApiError("userId is required", 400);

    await removeMember(user, id, targetUserId);

    // The caller may have removed themselves, in which case they can no longer
    // read the thread — say so rather than 404ing on the way out.
    if (targetUserId === user.userId) return Response.json({ success: true, conversation: null });

    return Response.json({ success: true, conversation: await getConversation(user, id) });
  } catch (error) {
    return errorResponse(error, "[chat] remove member failed");
  }
}
