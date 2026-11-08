import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/api/scope";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { listAnnouncementDeliveries } from "@/lib/school-ai/announcements-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSchoolAiUser();
    const { id } = await params;
    return Response.json(await listAnnouncementDeliveries(user, id, request.nextUrl.searchParams.get("executionId") ?? ""), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SchoolAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    return errorResponse(error, "Unable to load announcement delivery status.");
  }
}
