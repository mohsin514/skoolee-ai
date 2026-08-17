import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";

// GET /api/payroll?campusId=&month=&year=
// Returns the run (if any) with its lines + payment methods for the UI.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Reading the payroll run is a permission, not a rank: the accountant's
    // matrix grants payroll.view, and the coarse canManageOperations gate that
    // used to sit here refused them their own portal's main screen. Writes
    // below still require operations management.
    assertStaffRole(user);
    await assertPermission(user, "payroll", "view");
    const { searchParams } = new URL(req.url);
    const campusId = await resolveCampusId(user, searchParams.get("campusId"));
    const month = parseInt(searchParams.get("month") ?? "", 10);
    const year = parseInt(searchParams.get("year") ?? "", 10);

    if (!Number.isFinite(month) || month < 1 || month > 12) throw new ApiError("month must be 1-12", 400);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) throw new ApiError("year must be 2000-2100", 400);

    const run = await prisma.payrollRun.findUnique({
      where: { campusId_month_year: { campusId, month, year } },
      include: {
        lines: {
          include: { user: { select: { id: true, fullName: true, role: true, joiningDate: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const paymentMethods = await prisma.paymentMethodRef.findMany({
      where: { campusId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: { run, paymentMethods } });
  } catch (error) {
    return errorResponse(error, "[payroll] GET failed");
  }
}
