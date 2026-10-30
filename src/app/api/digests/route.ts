import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { listDigests, prepareDigest } from "@/lib/family/digests";

// SKO-423: weekly family digests for a class. GET ?classId= · POST {classId, week: YYYY-MM-DD}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const classId = request.nextUrl.searchParams.get("classId");
    if (!classId) throw new ApiError("classId is required", 400);
    return Response.json({ success: true, data: await listDigests(user, classId) });
  } catch (error) { return errorResponse(error, "[digests] GET failed"); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireAuthUser(); return Response.json({ success: true, data: await prepareDigest(user, await request.json().catch(() => ({}))) }, { status: 201 }); }
  catch (error) { return errorResponse(error, "[digests] POST failed"); }
}
