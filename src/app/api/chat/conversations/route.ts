import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse } from "@/lib/api/scope";
import {
  createGroupConversation,
  getOrCreateDirect,
  listConversations,
  requireChatUser,
} from "@/lib/chat/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DIRECT"), userId: z.string().min(1) }),
  z.object({
    kind: z.enum(["GROUP", "CLASS", "ANNOUNCEMENT"]),
    title: z.string().min(1).max(120),
    topic: z.string().max(500).optional(),
    memberIds: z.array(z.string().min(1)).default([]),
    classId: z.string().min(1).optional(),
    includeGuardians: z.boolean().optional(),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireChatUser();
    const { searchParams } = new URL(req.url);

    const filterParam = searchParams.get("filter");
    const filter =
      filterParam === "unread" || filterParam === "archived" ? filterParam : "all";

    const conversations = await listConversations(user, {
      filter,
      query: searchParams.get("q") ?? undefined,
      limit: Number(searchParams.get("limit")) || undefined,
    });

    return Response.json({ success: true, conversations });
  } catch (error) {
    return errorResponse(error, "[chat] list conversations failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireChatUser();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

    const conversation =
      parsed.data.kind === "DIRECT"
        ? await getOrCreateDirect(user, parsed.data.userId)
        : await createGroupConversation(user, parsed.data);

    return Response.json({ success: true, conversation });
  } catch (error) {
    return errorResponse(error, "[chat] create conversation failed");
  }
}
