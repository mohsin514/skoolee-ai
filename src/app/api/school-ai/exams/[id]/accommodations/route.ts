import { requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { approveSchoolAiAccommodation, getSchoolAiAccommodations } from "@/lib/school-ai/exam-service";
import { readBoundedJson, schoolAiError } from "@/lib/school-ai/http";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return Response.json({ accommodations: await getSchoolAiAccommodations(await requireAuthUser(), (await context.params).id) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return schoolAiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    return Response.json({ approval: await approveSchoolAiAccommodation(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 8000)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
/** SKO-410: an exceptional live extension of a running attempt. */
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { liveAdjustment } = await import("@/lib/accommodations/service");
    return Response.json({ adjustment: await liveAdjustment(await requireAuthUser(), (await context.params).id, await readBoundedJson(request, 4000)) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return schoolAiError(error); }
}
