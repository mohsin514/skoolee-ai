import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { markRead, requireChatUser } from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;
    await markRead(user, id);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[chat] mark read failed");
  }
}
