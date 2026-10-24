import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { familyJourneys } from "@/lib/transport/service";

export const runtime = "nodejs";

// SKO-437: today's journey status for one child of this guardian — no other rider, no crew contact.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await familyJourneys(user, request.nextUrl.searchParams.get("studentId") ?? "") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[family/transport] GET failed"); }
}
