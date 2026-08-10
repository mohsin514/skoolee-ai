import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// PATCH /api/payroll/lines
// body (edit): { id, basic?, allowances?, deductions?, bonus? } — DRAFT lines only, net recomputed
// body (pay):  { id, status: "PAID", paymentMethodId? } — posts an EXPENSE LedgerEntry idempotently
//                                                          (unique payroll_line_id) against the
//                                                          campus "Salaries Expense" account.

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "payroll", "edit");
    const body = await req.json();

    const id = String(body.id ?? "");
    if (!id) throw new ApiError("id is required", 400);

    const line = await prisma.payrollLine.findUnique({
      where: { id },
      include: { payrollRun: { select: { campusId: true, month: true, year: true } } },
    });
    if (!line) throw new ApiError("Payroll line not found", 404);
    const campusId = await resolveCampusId(user, line.payrollRun.campusId);

    if (String(body.status ?? "").toUpperCase() === "PAID") {
      if (line.status === "PAID") {
        return Response.json({ success: true, data: line, alreadyPaid: true });
      }
      const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
      const now = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        const paid = await tx.payrollLine.update({
          where: { id },
          data: { status: "PAID", paidAt: now, paymentMethodId },
        });

        const account = await tx.chartOfAccount.upsert({
          where: { campusId_name: { campusId, name: "Salaries Expense" } },
          create: { campusId, name: "Salaries Expense", type: "EXPENSE", isSystem: true },
          update: {},
        });

        await tx.ledgerEntry.create({
          data: {
            campusId,
            kind: "EXPENSE",
            sourceName: "Payroll",
            accountId: account.id,
            paymentMethod: paymentMethodId ? (await tx.paymentMethodRef.findUnique({ where: { id: paymentMethodId } }))?.name : null,
            date: now,
            amount: paid.net,
            note: `Payroll ${line.payrollRun.month}/${line.payrollRun.year}`,
            payrollLineId: paid.id,
            createdById: user.userId,
          },
        });
        return paid;
      });

      return Response.json({ success: true, data: updated, alreadyPaid: false });
    }

    // Edit a DRAFT line
    if (line.status !== "DRAFT" && line.status !== "UNPAID") {
      throw new ApiError("Only DRAFT lines can be edited", 409);
    }
    const basic = body.basic !== undefined ? parseInt(String(body.basic), 10) || 0 : line.basic;
    const allowances = body.allowances !== undefined ? parseInt(String(body.allowances), 10) || 0 : line.allowances;
    const deductions = body.deductions !== undefined ? parseInt(String(body.deductions), 10) || 0 : line.deductions;
    const bonus = body.bonus !== undefined ? parseInt(String(body.bonus), 10) || 0 : line.bonus;

    const updated = await prisma.payrollLine.update({
      where: { id },
      data: {
        basic,
        allowances,
        deductions,
        bonus,
        net: basic + allowances - deductions + bonus,
        status: "UNPAID",
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[payroll/lines] PATCH failed");
  }
}
