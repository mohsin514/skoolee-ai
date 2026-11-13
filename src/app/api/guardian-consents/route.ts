import { NextRequest } from "next/server";
import { requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { campusConsentStatus } from "@/lib/family/guardian-consent";

// SKAI-1157: consent status for every active pupil on the campus (read-only). GET ?campusId=&classId=
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = request.nextUrl.searchParams;
    return ok(await campusConsentStatus(user, { campusId: params.get("campusId"), classId: params.get("classId") }));
  } catch (error) { return failFrom(error, "[guardian-consents] GET failed"); }
}
