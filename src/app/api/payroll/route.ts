import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parsePayrollPeriod } from "@/lib/payroll-period";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
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
    const { month, year } = parsePayrollPeriod(searchParams.get("month"), searchParams.get("year"));

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
