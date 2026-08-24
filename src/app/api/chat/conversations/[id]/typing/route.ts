import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { prisma } from "@/lib/db/prisma";
import { publishToUsers } from "@/lib/chat/realtime";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long the other end should show the indicator before it lapses on its
 *  own. Long enough to survive the gap between keystroke batches, short enough
 *  that a closed tab stops "typing" almost immediately. */
const TYPING_TTL_MS = 6000;

/**
 * Typing indicator. Nothing is stored: it fans out over Redis and expires by
 * the timestamp it carries, so a dropped connection cannot leave someone
 * permanently mid-sentence.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireChatUser();
    const { id } = await ctx.params;

    // Client-side throttling is a suggestion, not a guarantee.
    const limit = rateLimit(`chat:typing:${user.userId}`, { limit: 30, windowMs: 60_000 });
    if (!limit.ok) return Response.json({ success: true });

    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId: id, userId: user.userId, leftAt: null },
      select: { id: true },
    });
    if (!membership) return Response.json({ success: true });

    const others = await prisma.conversationMember.findMany({
      where: { conversationId: id, leftAt: null, userId: { not: user.userId } },
      select: { userId: true },
    });

    await publishToUsers(
      others.map((m) => m.userId),
      {
        type: "typing",
        conversationId: id,
        payload: {
          userId: user.userId,
          fullName: user.fullName ?? "Someone",
          until: Date.now() + TYPING_TTL_MS,
        },
      }
    );

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[chat] typing failed");
  }
}
