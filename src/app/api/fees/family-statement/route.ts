import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertSharedModuleRead, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { reconcileStatement, schoolToday } from "@/lib/fees/statement";
import { installmentStates, type Installment } from "@/lib/fees/installments";
import { familyAdjustment } from "@/lib/fees/adjustments-service";

// GET /api/fees/family-statement?studentId=&currency=
// SKO-431: the whole statement for one authorized child in one currency (no silent conversion), with
// each invoice's due state in the school's timezone and a reconciliation the family can check.
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const studentId = req.nextUrl.searchParams.get("studentId");
    const student = await prisma.student.findFirst({
      where: { ...(studentId ? { id: studentId } : {}), ...studentScope(user, "finances") },
      orderBy: [{ rollNo: "asc" }, { id: "asc" }],
      select: { id: true, fullName: true, school: { select: { timezone: true } } },
    });
    if (!student) throw new ApiError("Your account does not have finance access for this child.", 404);
    const invoices = await prisma.invoice.findMany({
      where: { studentId: student.id },
      orderBy: [{ dueDate: "desc" }, { id: "asc" }],
      take: 500,
      include: { payments: { orderBy: { paymentDate: "desc" }, select: { id: true, amount: true, receiptNo: true, paymentDate: true, paymentMethod: true } } },
    });
    const currencies = [...new Set(invoices.map(invoice => invoice.currency))];
    const requested = req.nextUrl.searchParams.get("currency");
    const focused = invoices.find(invoice => invoice.id === req.nextUrl.searchParams.get("invoice"))?.currency;
    const currency = requested && currencies.includes(requested) ? requested : focused ?? currencies[0] ?? null;
    const inCurrency = invoices.filter(invoice => invoice.currency === currency);
    const today = schoolToday(student.school.timezone);
    // Approved instalment plans replace an invoice's single due date with their own schedule.
    const plans = await prisma.paymentPlan.findMany({ where: { invoiceId: { in: inCurrency.map(invoice => invoice.id) }, status: "active" }, select: { invoiceId: true, installmentsJson: true, paidAtCreation: true } });
    const schedule = new Map(plans.map(plan => [plan.invoiceId!, plan]));
    // SKO-433: decided refunds, credits and waivers, with the family-facing explanation only.
    const adjustments = (await prisma.financialAdjustment.findMany({ where: { invoiceId: { in: inCurrency.map(invoice => invoice.id) } }, orderBy: { createdAt: "asc" } })).map(familyAdjustment).filter((row): row is NonNullable<ReturnType<typeof familyAdjustment>> => Boolean(row));
    const rows = inCurrency.map(invoice => {
      const plan = schedule.get(invoice.id);
      return { id: invoice.id, status: invoice.status, totalAmount: invoice.totalAmount, totalAmountPaid: invoice.totalAmountPaid, balanceDue: invoice.balanceDue, dueDate: invoice.dueDate.toISOString().slice(0, 10),
        ...(plan ? { installments: installmentStates(plan.installmentsJson as Installment[], invoice.totalAmountPaid - plan.paidAtCreation, today) } : {}) };
    });
    const summary = reconcileStatement(rows, today);
    return Response.json({
      success: true,
      data: {
        student: { id: student.id, fullName: student.fullName },
        currency, currencies, today, timezone: student.school.timezone,
        summary: { ...summary, states: undefined },
        invoices: inCurrency.map((invoice, index) => ({
          id: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency, status: invoice.status,
          dueState: summary.states[invoice.id], dueDate: rows[index].dueDate, installments: rows[index].installments ?? null, adjustments: adjustments.filter(row => row.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, ...row }) => row),
          totalAmount: invoice.totalAmount, paid: invoice.totalAmountPaid, balance: invoice.balanceDue,
          receipts: invoice.payments.map(payment => ({ id: payment.id, amount: payment.amount, receiptNo: payment.receiptNo, paymentDate: payment.paymentDate.toISOString().slice(0, 10), method: payment.paymentMethod })),
        })),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[fees/family-statement] GET failed");
  }
}
