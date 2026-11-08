import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { guardianRelationshipAuthorityWhere } from "@/lib/parent/guardian-query";
import { prisma } from "@/lib/db/prisma";
import { answerTrip, guardianTrips } from "@/lib/family/trips";

// SKO-421: trip permission requests for one child. GET ?studentId= · POST {tripId, studentId, version, choice, idempotencyKey}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (user.role !== "PARENT" || !studentId) throw new ApiError("Not found", 404);
    // A verified, current relationship to this child; who may sign is decided per trip by its consent kind.
    const related = await prisma.guardianRelationship.findFirst({ where: { ...guardianRelationshipAuthorityWhere(user.userId, new Date(), user.schoolId), studentId }, select: { id: true } });
    if (!related) throw new ApiError("Not found", 404);
    return Response.json({ success: true, data: await guardianTrips(user.userId, user.schoolId, [studentId]) });
  } catch (error) { return errorResponse(error, "[family/trips] GET failed"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const row = await answerTrip(user, await request.json().catch(() => ({})));
    return Response.json({ success: true, data: { choice: row.choice, receiptCode: row.receiptCode, at: row.createdAt, tripVersionId: row.tripVersionId } }, { status: 201 });
  } catch (error) { return errorResponse(error, "[family/trips] POST failed"); }
}
