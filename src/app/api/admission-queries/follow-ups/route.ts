import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";

// GET /api/admission-queries/follow-ups?queryId=
// Lists the follow-up timeline for one admission query (campus-scoped).

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const queryId = req.nextUrl.searchParams.get("queryId");
    if (!queryId) throw new ApiError("queryId required", 400);

    const query = await prisma.admissionQuery.findFirst({
      where: { id: queryId, campus: { schoolId: user.schoolId } },
      select: { id: true },
    });
    if (!query) throw new ApiError("Admission query not found", 404);

    const followUps = await prisma.admissionQueryFollowUp.findMany({
      where: { queryId },
      select: {
        id: true,
        date: true,
        note: true,
        nextDate: true,
        actor: { select: { id: true, fullName: true } },
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 100,
    });

    return Response.json({ success: true, data: followUps });
  } catch (error) {
    return errorResponse(error, "[admission-queries/follow-ups] GET failed");
  }
}