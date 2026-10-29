import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { campusConsentStatus } from "@/lib/family/guardian-consent";

// SKAI-1157: consent status for every active pupil on the campus (read-only). GET ?campusId=&classId=
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams;
    return Response.json({ success: true, data: await campusConsentStatus(user, { campusId: params.get("campusId"), classId: params.get("classId") }) });
  } catch (error) { return errorResponse(error, "[guardian-consents] GET failed"); }
}
