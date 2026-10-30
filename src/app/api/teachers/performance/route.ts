import { NextRequest } from "next/server";
import { requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { teachingEvidence } from "@/lib/staff/teaching-evidence";

// SKO-461: bounded, sourced teaching evidence. Leaders see their campus; a
// teacher sees only themself. No ranking, no overall score.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = req.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, sp.get("campusId"));
    const year = Number(sp.get("academicYear"));
    const academicYear = Number.isInteger(year) && year > 2000 && year < 2200 ? year : new Date().getFullYear();
    return ok(await teachingEvidence(user, campusId, academicYear, sp.get("teacherId")));
  } catch (error) {
    return failFrom(error, "[teachers/performance] GET failed");
  }
}
