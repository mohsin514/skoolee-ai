import { errorResponse, ApiError, requirePlatformOwner } from "@/lib/api/scope";
import { excludeObservation, pilotDetail, PilotError, proposeClaim, recordMeasure, recordObservation, reviewClaim, updateCharter } from "@/lib/pilots/service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const rethrow = (error: unknown): never => { throw error instanceof PilotError ? new ApiError(error.message, error.status) : error; };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformOwner();
    return Response.json({ success: true, data: await pilotDetail((await context.params).id).catch(rethrow) }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilots/:id] GET failed");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requirePlatformOwner();
    const id = (await context.params).id;
    const body = (await request.json().catch(() => null)) as { action?: string; data?: Record<string, unknown> } | null;
    const data = body?.data ?? {};
    const run = async () => {
      switch (body?.action) {
        case "charter": return { status: 200, result: await updateCharter(id, data, owner.userId) };
        case "observation": return { status: 201, result: await recordObservation(id, data, owner.userId) };
        case "exclude": return { status: 200, result: await excludeObservation(id, String(data.observationId ?? ""), data.reason) };
        case "measure": return { status: 201, result: await recordMeasure(id, data, owner.userId) };
        case "claim": return { status: 201, result: await proposeClaim(id, data, owner.userId) };
        case "review": return { status: 200, result: await reviewClaim(id, String(data.claimId ?? ""), data, owner.userId) };
        default: throw new PilotError("Unknown action", 400);
      }
    };
    const { status, result } = await run().catch(rethrow);
    return Response.json({ success: true, data: result }, { status, headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilots/:id] POST failed");
  }
}
