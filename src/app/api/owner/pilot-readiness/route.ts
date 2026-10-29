import { errorResponse, ApiError, requirePlatformOwner } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import {
  marketTrustBoard, pilotActivationGate, PilotGateError, recordCommercialEvent, recordTrustReview,
  saveProposal, saveReadinessRecord, schoolPilotRecords,
} from "@/lib/pilots/readiness-service";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

// SKAI-1016/1017/1018: platform-owner (founder) console for market trust, proposals and pilot readiness.
const rethrow = (error: unknown): never => {
  if (error instanceof PilotGateError) throw new ApiError(error.problems.length ? `${error.message} (${error.problems.join("; ")})` : error.message, error.status);
  throw error;
};

async function requireSchool(schoolId: unknown) {
  if (typeof schoolId !== "string" || !schoolId) throw new ApiError("Choose a school.", 400);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, status: true } });
  if (!school || school.status === "DELETED") throw new ApiError("School not found", 404);
  return school.id;
}

export async function GET(request: Request) {
  try {
    await requirePlatformOwner();
    const schoolId = new URL(request.url).searchParams.get("schoolId");
    const [board, schools] = await Promise.all([
      marketTrustBoard(),
      prisma.school.findMany({ where: { status: { not: "DELETED" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ]);
    const school = schoolId ? await requireSchool(schoolId) : null;
    const records = school ? await schoolPilotRecords(school) : null;
    const gate = school ? await pilotActivationGate(school) : null;
    return Response.json({ success: true, data: { board, schools, records, gate } }, { headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilot-readiness] GET failed");
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requirePlatformOwner();
    const body = (await request.json().catch(() => null)) as { action?: string; schoolId?: string; pilotId?: string; data?: unknown } | null;
    const run = async () => {
      switch (body?.action) {
        case "trust": return recordTrustReview(body.data, owner.userId);
        case "proposal": return saveProposal(await requireSchool(body.schoolId), body.data, owner.userId);
        case "stage": return recordCommercialEvent(await requireSchool(body.schoolId), body.data, owner.userId);
        case "readiness": return saveReadinessRecord(await requireSchool(body.schoolId), body.data, owner.userId, body.pilotId ?? null);
        default: throw new ApiError("Unknown action", 400);
      }
    };
    const result = await run().catch(rethrow);
    return Response.json({ success: true, data: result }, { status: 201, headers: noStore });
  } catch (error) {
    return errorResponse(error, "[owner/pilot-readiness] POST failed");
  }
}
