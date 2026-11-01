import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { reconcileStatement, schoolToday } from "@/lib/fees/statement";
import { installmentStates, type Installment } from "@/lib/fees/installments";
import { familyAdjustment } from "@/lib/fees/adjustments-service";

/** Largest ledger one statement will show; above this the request fails explicitly rather than truncating. */
export const LEDGER_CEILING = 5000;

/** SKAI-1653: the whole statement for one authorized child in one currency (see the route for the contract). */
export async function familyStatement(user: AuthUser, studentId: string | null, requested: string | null, focusInvoiceId: string | null) {
  const student = await prisma.student.findFirst({
    where: { ...(studentId ? { id: studentId } : {}), ...studentScope(user, "finances") },
    orderBy: [{ rollNo: "asc" }, { id: "asc" }],
    select: { id: true, fullName: true, school: { select: { timezone: true } } },
  });
  if (!student) throw new ApiError("Your account does not have finance access for this child.", 404);
  // SKAI-1653: currencies come from the whole ledger (database aggregate), and every invoice is loaded. A statement is
  // never cut short: a ledger above the ceiling fails with a clear message instead of showing partial totals.
  const currencyRows = await prisma.invoice.groupBy({ by: ["currency"], where: { studentId: student.id }, _count: { _all: true }, orderBy: { currency: "asc" } });
  const currencies = currencyRows.map(row => row.currency);
  const invoices = await prisma.invoice.findMany({
    where: { studentId: student.id },
    orderBy: [{ dueDate: "desc" }, { id: "asc" }],
    take: LEDGER_CEILING + 1,
    include: { payments: { orderBy: { paymentDate: "desc" }, select: { id: true, amount: true, receiptNo: true, paymentDate: true, paymentMethod: true } } },
  });
  if (invoices.length > LEDGER_CEILING) throw new ApiError("This child's fee history is too long to show in one statement. Please contact the school for a statement.", 409);
  const focused = invoices.find(invoice => invoice.id === focusInvoiceId)?.currency;
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
  return {
    student: { id: student.id, fullName: student.fullName },
    currency, currencies, today, timezone: student.school.timezone,
    summary: { ...summary, states: undefined },
    invoices: inCurrency.map((invoice, index) => ({
      id: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency, status: invoice.status,
      dueState: summary.states[invoice.id], dueDate: rows[index].dueDate, installments: rows[index].installments ?? null, adjustments: adjustments.filter(row => row.invoiceId === invoice.id).map(({ invoiceId: _invoiceId, ...row }) => row),
      totalAmount: invoice.totalAmount, paid: invoice.totalAmountPaid, balance: invoice.balanceDue,
      receipts: invoice.payments.map(payment => ({ id: payment.id, amount: payment.amount, receiptNo: payment.receiptNo, paymentDate: payment.paymentDate.toISOString().slice(0, 10), method: payment.paymentMethod })),
    })),
  };
}
