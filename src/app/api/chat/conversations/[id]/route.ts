import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import {
  getConversation,
  removeMember,
  requireChatUser,
  updateConversation,
  updateMemberPreferences,
} from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two kinds of change arrive here: preferences, which are personal to the
// caller (mute, pin, archive), and settings, which change the thread for
// everyone (title, topic, lock). They are split so a member can never alter
// the room by sending a field they are not allowed to set.
const patchSchema = z.object({
  isMuted: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  title: z.string().min(1).max(120).optional(),
  topic: z.string().max(500).optional(),
  isLocked: z.boolean().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;
    return Response.json({ success: true, conversation: await getConversation(user, id) });
  } catch (error) {
    return errorResponse(error, "[chat] get conversation failed");
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const { isMuted, isPinned, isArchived, ...settings } = parsed.data;

    if (isMuted !== undefined || isPinned !== undefined || isArchived !== undefined) {
      await updateMemberPreferences(user, id, { isMuted, isPinned, isArchived });
    }

    if (Object.values(settings).some((v) => v !== undefined)) {
      return Response.json({
        success: true,
        conversation: await updateConversation(user, id, settings),
      });
    }

    return Response.json({ success: true, conversation: await getConversation(user, id) });
  } catch (error) {
    return errorResponse(error, "[chat] update conversation failed");
  }
}

/** Leaving, not deleting: the thread survives for everyone still in it. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;
    await removeMember(user, id, user.userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[chat] leave conversation failed");
  }
}
