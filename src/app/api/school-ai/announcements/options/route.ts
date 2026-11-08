import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { getAnnouncementOptions } from "@/lib/school-ai/announcements-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const user = await requireSchoolAiUser();
    return Response.json({ options: await getAnnouncementOptions(user, request.nextUrl.searchParams.get("campusId")) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SchoolAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return errorResponse(error, "Unable to load announcement choices.");
  }
}
