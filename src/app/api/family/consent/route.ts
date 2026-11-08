import { NextRequest } from "next/server";
import { ApiError, errorResponse, readJsonObject, requireAuthUser } from "@/lib/api/scope";
import { guardianConsentView, recordGuardianConsent } from "@/lib/family/guardian-consent";

// SKAI-1157: a guardian's consent for one child. GET ?studentId= · POST {studentId, choices, noticeVersion, language}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("Not found", 404);
    return Response.json({ success: true, data: await guardianConsentView(user, studentId) });
  } catch (error) { return errorResponse(error, "[family/consent] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await recordGuardianConsent(user, await readJsonObject(request)) }, { status: 201 });
  } catch (error) { return errorResponse(error, "[family/consent] POST failed"); }
}
