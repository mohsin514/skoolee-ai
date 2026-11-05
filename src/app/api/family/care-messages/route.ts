import type { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { messagesForMe } from "@/lib/care/service";

export const runtime = "nodejs";

// SKO-439: messages a safeguarding lead approved and released to this guardian — the approved text only.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (user.role !== "PARENT") return Response.json({ success: true, data: [] });
    const page = await messagesForMe(user, request.nextUrl.searchParams.get("cursor"));
    return Response.json({ success: true, data: page.items, nextCursor: page.nextCursor }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[family/care-messages] GET failed"); }
}
