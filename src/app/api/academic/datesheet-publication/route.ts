import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { publicationStatus, publishDatesheet } from "@/lib/academic/datesheet-publication";

// SKO-413: the examination office reviews live checks and pending changes, then
// publishes an exact datesheet version. A blocked publication returns its issues.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) throw new ApiError("sessionId is required", 400);
    return Response.json({ success: true, data: await publicationStatus(user, sessionId) });
  } catch (error) {
    return errorResponse(error, "[academic/datesheet-publication] GET failed");
  }
}

const Publish = z.object({ sessionId: z.string().min(1).max(100), expectedVersion: z.number().int().min(0), reason: z.string().max(1000).nullable().optional() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const parsed = Publish.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Invalid publication request", 400);
    const result = await publishDatesheet(user, parsed.data.sessionId, parsed.data.expectedVersion, parsed.data.reason);
    return Response.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const issues = (error as { issues?: unknown }).issues;
    if (issues) return Response.json({ success: false, error: (error as Error).message, issues }, { status: 409 });
    return errorResponse(error, "[academic/datesheet-publication] POST failed");
  }
}
