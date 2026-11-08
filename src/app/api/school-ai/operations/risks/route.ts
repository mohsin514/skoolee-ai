import type { NextRequest } from "next/server";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { schoolAiError } from "@/lib/school-ai/http";
import { getRiskOptions, inspectRiskEvidence } from "@/lib/school-ai/school-operations-risk-service";
export async function GET(request: NextRequest) {
  try { const user = await requireSchoolAiUser(), params = request.nextUrl.searchParams, campusId = params.get("campusId"); if (!campusId) throw new SchoolAiError("Choose a campus.", 400); const indicator = params.get("indicator"); return Response.json(params.get("scopeId") ? { evidence: await inspectRiskEvidence(user, { campusId, indicator, scopeId: params.get("scopeId"), date: params.get("date") }) } : { options: await getRiskOptions(user, campusId, indicator) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
