import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createPaymentMethod } from "@/lib/accounts/payment-method-command";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageFinance,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

// Payment method references CRUD
// GET /api/accounts/payment-methods?campusId=
// POST /api/accounts/payment-methods {campusId,name}
// PATCH /api/accounts/payment-methods {id,name?,isActive?}
// DELETE /api/accounts/payment-methods?id=

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "accounts");
    const campusId = req.nextUrl.searchParams.get("campusId");
    const resolved = await resolveCampusId(user, campusId);

    const methods = await prisma.paymentMethodRef.findMany({
      where: scopedCampusWhere(user, resolved ?? undefined) as any,
      orderBy: { name: "asc" },
    });

    return Response.json({ success: true, data: methods });
  } catch (error) {
    return errorResponse(error, "[accounts/payment-methods] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "add");

    const body = await req.json();
    const method = await createPaymentMethod(user, body);

    return Response.json({ success: true, data: method }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id is required", 400);

    const method = await prisma.paymentMethodRef.findFirst({
      where: { id: body.id, campus: { schoolId: user.schoolId } },
    });
    if (!method) throw new ApiError("Payment method not found", 404);

    if (body.name && String(body.name).trim() !== method.name) {
      const dup = await prisma.paymentMethodRef.findFirst({
        where: { campusId: method.campusId, name: String(body.name).trim() },
      });
      if (dup) throw new ApiError("A payment method with this name already exists", 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.paymentMethodRef.update({
        where: { id: method.id },
        data: {
          name: body.name ? String(body.name).trim() : undefined,
          isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        },
      });
      await writeAuditEvent(tx, user, {
        table: "payment_method_refs", recordId: next.id, action: "UPDATE", campusId: next.campusId,
        before: { isActive: method.isActive }, after: { isActive: next.isActive },
      });
      return next;
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "accounts", "delete");

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const method = await prisma.paymentMethodRef.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!method) throw new ApiError("Payment method not found", 404);

    await prisma.$transaction(async (tx) => {
      // SKO-389: payroll history keeps the method it was paid by.
      const used = await tx.payrollLine.count({ where: { paymentMethodId: method.id } });
      if (used) throw new ApiError(`This payment method is recorded on ${used} payroll line(s), so it cannot be deleted. Rename it or stop using it instead.`, 409);
      await tx.paymentMethodRef.delete({ where: { id: method.id } });
      await writeAuditEvent(tx, user, {
        table: "payment_method_refs", recordId: method.id, action: "DELETE", campusId: method.campusId,
        before: { isActive: method.isActive },
      });
    });
    return Response.json({ success: true, message: "Payment method deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods DELETE failed");
  }
}