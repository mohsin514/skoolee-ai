import { NextRequest } from "next/server";
import { errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { saveSchoolPlanPrices } from "@/lib/owner/school-pricing-service";

// PUT /api/owner/schools/:id/pricing  body: { pricing: { PLAN: { price? } }, expected?: <overrides as loaded> }
// SKAI-1795: merges per plan (a plan without a price is cleared, others kept). SKAI-1794: a stale `expected` → 409.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformOwner();
    const { id } = await params;
    const body = await parseBody(req, jsonObjectBody);
    const pricing = await saveSchoolPlanPrices(user, id, body?.pricing, "expected" in body ? { expected: body.expected } : {});
    return Response.json({ success: true, data: { planPricing: pricing }, message: "Plan pricing updated successfully" });
  } catch (error) {
    return errorResponse(error, "[owner/schools/id/pricing] PUT failed");
  }
}
