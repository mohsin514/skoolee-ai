import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { getLocalePackage } from "@/lib/locale/store";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// PATCH /api/payroll/lines
// body (edit): { id, basic?, allowances?, deductions?, bonus? } — DRAFT lines only, net recomputed
// body (pay):  { id, status: "PAID", paymentMethodId? } — posts an EXPENSE LedgerEntry idempotently
//                                                          (unique payroll_line_id) against the
//                                                          campus "Salaries Expense" account.

/** SKAI-1326: a payroll amount is a whole, non-negative number of paisa that fits the Int32 column. */
function payrollAmount(value: unknown, field: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
    throw new ApiError(`${field} must be a whole, non-negative amount`, 400);
  }
  return amount;
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "payroll", "edit");
    const body = await parseBody(req, jsonObjectBody);

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
      // SKAI-1350: a negative or zero net cannot be paid; it would post a negative expense.
      if (!(line.net > 0)) throw new ApiError("Only a payroll line with a positive net can be paid.", 409);
      const paymentMethodId = body.paymentMethodId ? String(body.paymentMethodId) : null;
      const now = new Date();

      // SKO-468: the ledger posts in the campus currency, and a double-submitted "pay" posts once.
      const currency = (await getLocalePackage(user.schoolId, campusId)).currency;
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.payrollLine.updateMany({
          where: { id, status: { not: "PAID" } },
          data: { status: "PAID", paidAt: now, paymentMethodId },
        });
        if (!claimed.count) return null;
        const paid = await tx.payrollLine.findUniqueOrThrow({ where: { id } });

        const account = await tx.chartOfAccount.upsert({
          where: { campusId_name: { campusId, name: "Salaries Expense" } },
          create: { campusId, name: "Salaries Expense", type: "EXPENSE", isSystem: true },
          update: {},
        });

        await tx.ledgerEntry.create({
          data: {
            campusId,
            kind: "EXPENSE",
            currency,
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
        await writeAuditEvent(tx, user, {
          table: "payroll_lines", recordId: paid.id, action: "UPDATE", campusId,
          before: { status: line.status, net: line.net },
          after: { status: paid.status, net: paid.net, paymentMethodId, ledgerAccountId: account.id },
        });
        return paid;
      });
      if (!updated) return Response.json({ success: true, data: await prisma.payrollLine.findUnique({ where: { id } }), alreadyPaid: true });

      return Response.json({ success: true, data: updated, alreadyPaid: false });
    }

    // Edit a DRAFT line
    if (line.status !== "DRAFT" && line.status !== "UNPAID") {
      throw new ApiError("Only DRAFT lines can be edited", 409);
    }
    // SKAI-1326: amounts are whole, non-negative paisa within the Int32 column; anything else is rejected, not truncated.
    const basic = body.basic !== undefined ? payrollAmount(body.basic, "basic") : line.basic;
    const allowances = body.allowances !== undefined ? payrollAmount(body.allowances, "allowances") : line.allowances;
    const deductions = body.deductions !== undefined ? payrollAmount(body.deductions, "deductions") : line.deductions;
    const bonus = body.bonus !== undefined ? payrollAmount(body.bonus, "bonus") : line.bonus;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.payrollLine.update({
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
      await writeAuditEvent(tx, user, { table: "payroll_lines", recordId: next.id, action: "UPDATE", campusId, before: { status: line.status, basic: line.basic, allowances: line.allowances, deductions: line.deductions, bonus: line.bonus, net: line.net }, after: { status: next.status, basic: next.basic, allowances: next.allowances, deductions: next.deductions, bonus: next.bonus, net: next.net } });
      return next;
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "[payroll/lines] PATCH failed");
  }
}
