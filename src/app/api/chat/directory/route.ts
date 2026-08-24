import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireChatUser } from "@/lib/chat/service";
import { listDirectory } from "@/lib/chat/directory";
import { getChatSettings } from "@/lib/chat/policy";
import { isUserRole } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everyone the caller may start a conversation with.
 *
 * This is the only place a user can enumerate other accounts, so the result
 * is the policy's reach and nothing wider — a guardian searching here finds
 * their children's teachers and the office, never the other families.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireChatUser();
    const { searchParams } = new URL(req.url);

    const roleParam = searchParams.get("role");
    const settings = await getChatSettings(user.schoolId);

    const contacts = await listDirectory(user, settings, {
      query: searchParams.get("q") ?? undefined,
      role: roleParam && isUserRole(roleParam) ? roleParam : undefined,
      limit: Number(searchParams.get("limit")) || undefined,
    });

    return Response.json({ success: true, contacts });
  } catch (error) {
    return errorResponse(error, "[chat] directory failed");
  }
}
