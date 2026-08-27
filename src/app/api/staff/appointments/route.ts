import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { getReportingChain } from "@/lib/staff/hierarchy";

// A staff member's service record (Module 8b).
// GET /api/staff/appointments?userId= — every position held, newest first,
// plus the chain of managers above them today.
//
// Position CHANGES go through PATCH /api/staff/hierarchy, which writes these
// rows. There is deliberately no POST here: an appointment that does not match
// the profile it belongs to is worse than no history at all.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "view");
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) throw new ApiError("userId is required", 400);

    const staff = await prisma.user.findFirst({
      where: { id: userId },
      select: { id: true, fullName: true, joiningDate: true },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);

    const [appointments, chain, secondaryLines, memberships] = await Promise.all([
      prisma.staffAppointment.findMany({
        where: { userId },
        select: {
          id: true,
          changeKind: true,
          designationName: true,
          departmentName: true,
          reportsToName: true,
          level: true,
          employmentType: true,
          employmentStatus: true,
          basicSalary: true,
          isActing: true,
          effectiveFrom: true,
          effectiveTo: true,
          orderRef: true,
          notes: true,
          approvedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
      }),
      getReportingChain(userId),
      prisma.staffReportingLine.findMany({
        where: { userId, endedAt: null },
        select: {
          id: true,
          kind: true,
          label: true,
          manager: { select: { id: true, fullName: true, staffProfile: { select: { designation: true } } } },
        },
      }),
      // A teacher covering Physics and Maths, or a professor sitting on an
      // admissions committee, belongs to several units at once. The chart files
      // them under the primary one; this is the full list.
      prisma.departmentMember.findMany({
        where: { userId, endedAt: null },
        select: {
          id: true,
          role: true,
          isPrimary: true,
          isActing: true,
          department: { select: { id: true, name: true, kind: true } },
        },
        orderBy: [{ isPrimary: "desc" }, { startedAt: "asc" }],
      }),
    ]);

    return Response.json({
      success: true,
      staff,
      appointments,
      reportingChain: chain,
      secondaryLines,
      memberships,
    });
  } catch (error) {
    return errorResponse(error, "[staff/appointments] GET failed");
  }
}
