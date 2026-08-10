import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

// Payment method references CRUD
// GET /api/accounts/payment-methods?campusId=
// POST /api/accounts/payment-methods {campusId,name}
// PATCH /api/accounts/payment-methods {id,name?,isActive?}
// DELETE /api/accounts/payment-methods?id=

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
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
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError("name is required", 400);

    const existing = await prisma.paymentMethodRef.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("A payment method with this name already exists", 409);

    const method = await prisma.paymentMethodRef.create({
      data: { campusId, name, isActive: body.isActive !== false },
    });

    return Response.json({ success: true, data: method }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

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

    const updated = await prisma.paymentMethodRef.update({
      where: { id: method.id },
      data: {
        name: body.name ? String(body.name).trim() : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
      },
    });

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const method = await prisma.paymentMethodRef.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
    });
    if (!method) throw new ApiError("Payment method not found", 404);

    await prisma.paymentMethodRef.delete({ where: { id: method.id } });
    return Response.json({ success: true, message: "Payment method deleted" });
  } catch (error) {
    return errorResponse(error, "accounts/payment-methods DELETE failed");
  }
}