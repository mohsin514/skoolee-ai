import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { computePayrollLine, proRateFactor, unpaidLeaveDeductionForMonth } from "@/lib/payroll";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { PAYROLL_ROLES, parsePayrollPeriod, parsePayrollRole, type PayrollRole } from "@/lib/payroll-period";

// POST /api/payroll/generate
// body: { campusId?, role?, month, year }
// Creates (or re-generates) a DRAFT PayrollRun for campus+month+year with one
// line per staff member (StaffProfile). A run that already exists is returned
// unchanged — re-generating never duplicates (unique [campusId, month, year])
// and never touches PAID lines; instead a DRAFT run's UNPAID lines are replaced.

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "payroll", "add");
    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);

    const { month, year } = parsePayrollPeriod(body.month, body.year);
    const role = parsePayrollRole(body.role);

    const existing = await prisma.payrollRun.findUnique({
      where: { campusId_month_year: { campusId, month, year } },
      include: { lines: true },
    });

    if (existing) {
      const hasPaid = existing.lines.some((l) => l.status === "PAID");
      if (hasPaid) {
        return Response.json({ success: true, data: existing, regenerated: false });
      }
      const staff = await collectStaff(campusId, role);
      const lines = await buildLines(campusId, month, year, staff);
      await prisma.$transaction(async (tx) => {
        await tx.payrollLine.deleteMany({ where: { payrollRunId: existing.id } });
        await tx.payrollLine.createMany({
          data: lines.map((l) => ({ ...l, payrollRunId: existing.id })),
        });
        await tx.payrollRun.update({ where: { id: existing.id }, data: { status: "DRAFT", generatedById: user.userId, generatedAt: new Date() } });
        await writeAuditEvent(tx, user, {
          table: "payroll_runs", recordId: existing.id, action: "UPDATE", campusId,
          before: { status: existing.status, lines: existing.lines.length, totalNet: existing.lines.reduce((sum, l) => sum + l.net, 0) },
          after: { status: "DRAFT", month, year, lines: lines.length, totalNet: lines.reduce((sum, l) => sum + l.net, 0), regenerated: true },
        });
      });
      const refreshed = await prisma.payrollRun.findUnique({
        where: { id: existing.id },
        include: { lines: { include: { user: { select: { id: true, fullName: true, role: true } } } } },
      });
      return Response.json({ success: true, data: refreshed, regenerated: true });
    }

    const staff = await collectStaff(campusId, role);
    const lines = await buildLines(campusId, month, year, staff);

    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: {
          campusId,
          month,
          year,
          status: "DRAFT",
          generatedById: user.userId,
          generatedAt: new Date(),
          lines: { create: lines },
        },
        include: { lines: { include: { user: { select: { id: true, fullName: true, role: true } } } } },
      });
      await writeAuditEvent(tx, user, { table: "payroll_runs", recordId: created.id, action: "CREATE", campusId, after: { status: created.status, month, year, lines: created.lines.length, totalNet: created.lines.reduce((sum, l) => sum + l.net, 0) } });
      return created;
    });

    return Response.json({ success: true, data: run, regenerated: false });
  } catch (error) {
    return errorResponse(error, "[payroll/generate] POST failed");
  }
}

async function collectStaff(campusId: string, role?: PayrollRole) {
  const staff = await prisma.user.findMany({
    where: {
      campusId,
      isActive: true,
      role: { in: [...PAYROLL_ROLES] },
      ...(role ? { role } : {}),
    },
    select: {
      id: true,
      fullName: true,
      role: true,
      joiningDate: true,
      staffProfile: { select: { basicSalary: true, allowancesJson: true, deductionsJson: true } },
    },
  });
  return staff.filter((s) => s.staffProfile && s.staffProfile.basicSalary > 0);
}

async function buildLines(campusId: string, month: number, year: number, staff: any[]) {
  const lines = [];
  for (const s of staff) {
    const gross = s.staffProfile.basicSalary + sumAllowances(s.staffProfile.allowancesJson);
    const { deduction } = await unpaidLeaveDeductionForMonth(
      campusId,
      s.id,
      s.role,
      month,
      year,
      gross
    );
    const computed = computePayrollLine(
      s.staffProfile.basicSalary,
      s.staffProfile.allowancesJson,
      s.staffProfile.deductionsJson,
      proRateFactor(s.joiningDate, month, year),
      deduction
    );
    lines.push({
      userId: s.id,
      basic: computed.basic,
      allowances: computed.allowances,
      deductions: computed.deductions,
      bonus: computed.bonus,
      net: computed.net,
      breakdownJson: computed.breakdownJson as any,
    });
  }
  return lines;
}

function sumAllowances(json: unknown): number {
  if (typeof json !== "object" || json === null) return 0;
  return Object.values(json as Record<string, unknown>)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n))
    .reduce((s, n) => s + Math.round(n), 0);
}
