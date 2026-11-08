import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertSharedModuleRead, assertStaffRole, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { installmentStates, validatePlan, type Installment } from "@/lib/fees/installments";
import { schoolToday } from "@/lib/fees/statement";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-431: instalment agreements for one invoice. Finance staff propose a schedule that adds up exactly
// to what is still owed; a different staff member approves it; families see the approved schedule.

type PlanRow = { id: string; status: string; currency: string | null; installmentsJson: Prisma.JsonValue; paidAtCreation: number; createdById: string | null; approvedById: string | null; approvedAt: Date | null; version: number; createdAt: Date };
function present(plan: PlanRow, invoice: { totalAmountPaid: number }, today: string, viewerId: string) {
  const installments = plan.installmentsJson as Installment[];
  return {
    id: plan.id, status: plan.status, currency: plan.currency, version: plan.version, createdAt: plan.createdAt.toISOString(), approvedAt: plan.approvedAt?.toISOString() ?? null,
    proposedByYou: plan.createdById === viewerId,
    installments: installmentStates(installments, invoice.totalAmountPaid - plan.paidAtCreation, today),
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "fees");
    const invoiceId = req.nextUrl.searchParams.get("invoiceId");
    if (!invoiceId) throw new ApiError("invoiceId required", 400);
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, student: studentScope(user, "finances") }, select: { id: true, totalAmountPaid: true, balanceDue: true, currency: true, school: { select: { timezone: true } } } });
    if (!invoice) throw new ApiError("Invoice not found", 404);
    const family = user.role === "PARENT" || user.role === "STUDENT";
    const plans = await prisma.paymentPlan.findMany({ where: { invoiceId, status: family ? "active" : { in: ["proposed", "active"] } }, orderBy: { createdAt: "desc" } });
    const today = schoolToday(invoice.school.timezone);
    return Response.json({ success: true, data: { today, balance: invoice.balanceDue, currency: invoice.currency, plans: plans.map(plan => present(plan, invoice, today, user.userId)) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[fees/payment-plans] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "add");
    const body = await parseBody(req, jsonObjectBody);
    const installments: Installment[] = Array.isArray(body.installments) ? body.installments.map((item: { dueDate?: unknown; amount?: unknown }) => ({ dueDate: String(item?.dueDate ?? ""), amount: Number(item?.amount) })) : [];
    const plan = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: String(body.invoiceId ?? ""), schoolId: user.schoolId, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) }, select: { id: true, schoolId: true, campusId: true, studentId: true, status: true, currency: true, balanceDue: true, totalAmountPaid: true, school: { select: { timezone: true } } } });
      if (!invoice) throw new ApiError("Invoice not found", 404);
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoice.id} AND school_id = ${invoice.schoolId} FOR UPDATE`;
      if (invoice.status === "CANCELLED" || invoice.balanceDue <= 0) throw new ApiError("Only an invoice with an amount still owed can be split into instalments.", 409);
      const problem = validatePlan(installments, invoice.balanceDue, schoolToday(invoice.school.timezone));
      if (problem) throw new ApiError(problem, 422);
      const created = await tx.paymentPlan.create({ data: { schoolId: invoice.schoolId, campusId: invoice.campusId, studentId: invoice.studentId, invoiceId: invoice.id, currency: invoice.currency, originalAmountDue: invoice.balanceDue, installmentCount: installments.length, installmentsJson: installments, paidAtCreation: invoice.totalAmountPaid, status: "proposed", createdById: user.userId } });
      await tx.auditLog.create({ data: { schoolId: invoice.schoolId, tableName: "payment_plans", recordId: created.id, userId: user.userId, newValue: { action: "proposed", invoiceId: invoice.id, installments } as Prisma.InputJsonValue } });
      return created;
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError("This invoice already has an open instalment plan. Approve or cancel it first.", 409);
      throw error;
    });
    return Response.json({ success: true, data: { id: plan.id, status: plan.status, version: plan.version } }, { status: 201 });
  } catch (error) { return errorResponse(error, "[fees/payment-plans] POST failed"); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "edit");
    const body = await parseBody(req, jsonObjectBody);
    const action = body.action === "approve" || body.action === "cancel" ? body.action : null;
    if (!action) throw new ApiError("action must be approve or cancel", 400);
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.findFirst({ where: { id: String(body.id ?? ""), schoolId: user.schoolId, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) } });
      if (!plan || !plan.invoiceId) throw new ApiError("Plan not found", 404);
      await tx.$queryRaw`SELECT id FROM payment_plans WHERE id = ${plan.id} FOR UPDATE`;
      const current = await tx.paymentPlan.findUniqueOrThrow({ where: { id: plan.id } });
      if (current.version !== Number(body.version)) throw new ApiError("This plan changed. Refresh it before deciding.", 409);
      if (action === "approve") {
        if (current.status === "active") return current;
        if (current.status !== "proposed") throw new ApiError("Only a proposed plan can be approved.", 409);
        if (current.createdById === user.userId) throw new ApiError("A plan must be approved by someone other than the person who proposed it.", 403);
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: plan.invoiceId }, select: { totalAmountPaid: true, balanceDue: true, status: true } });
        if (invoice.totalAmountPaid !== current.paidAtCreation || invoice.balanceDue !== current.originalAmountDue || invoice.status === "CANCELLED") throw new ApiError("The invoice changed since this plan was proposed. Cancel it and propose a new one.", 409);
      }
      if (action === "cancel" && current.status === "cancelled") return current;
      if (action === "cancel" && !["proposed", "active"].includes(current.status)) throw new ApiError("This plan can no longer be cancelled.", 409);
      const updated = await tx.paymentPlan.update({ where: { id: plan.id }, data: action === "approve" ? { status: "active", approvedById: user.userId, approvedAt: new Date(), version: { increment: 1 } } : { status: "cancelled", cancelledAt: new Date(), version: { increment: 1 } } });
      await tx.auditLog.create({ data: { schoolId: plan.schoolId, tableName: "payment_plans", recordId: plan.id, userId: user.userId, oldValue: { status: current.status }, newValue: { status: updated.status, action } } });
      return updated;
    });
    return Response.json({ success: true, data: { id: result.id, status: result.status, version: result.version } });
  } catch (error) { return errorResponse(error, "[fees/payment-plans] PATCH failed"); }
}
