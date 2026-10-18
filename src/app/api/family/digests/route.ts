import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { guardianDigests } from "@/lib/family/digests";

// SKO-423: a guardian's weekly updates for one child (learning-records access rechecked on every read).
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId is required", 400);
    return Response.json({ success: true, data: await guardianDigests(user, studentId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[family/digests] GET failed"); }
}
