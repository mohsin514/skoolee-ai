import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

// FeesMasterLine rows: priced (type, amount) inside a fee group.
// Amounts arrive as paisa from the client (rupeesToPaisa before sending).

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;
    const feeGroupId = searchParams.get("feeGroupId");

    const lines = await prisma.feesMasterLine.findMany({
      where: { ...scopedCampusWhere(user, campusId), ...(feeGroupId ? { feeGroupId } : {}) },
      include: {
        feeGroup: { select: { id: true, name: true } },
        feeType: { select: { id: true, name: true, code: true } },
      },
      orderBy: { feeType: { name: "asc" } },
    });
    return Response.json({ success: true, data: lines });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    if (!body.feeGroupId || !body.feeTypeId) throw new ApiError("feeGroupId and feeTypeId required", 400);
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 0) throw new ApiError("amount must be a non-negative integer (paisa)", 400);

    const [group, type] = await Promise.all([
      prisma.feeGroup.findFirst({ where: { id: body.feeGroupId, campusId } }),
      prisma.feeType.findFirst({ where: { id: body.feeTypeId, campusId } }),
    ]);
    if (!group) throw new ApiError("Fee group not found", 404);
    if (!type) throw new ApiError("Fee type not found", 404);

    const existing = await prisma.feesMasterLine.findUnique({
      where: { feeGroupId_feeTypeId: { feeGroupId: body.feeGroupId, feeTypeId: body.feeTypeId } },
    });
    if (existing) throw new ApiError("This fee type already exists in the group", 409);

    const line = await prisma.feesMasterLine.create({
      data: { campusId, feeGroupId: body.feeGroupId, feeTypeId: body.feeTypeId, amount, dueDate: body.dueDate ? new Date(body.dueDate) : null },
      include: { feeType: { select: { id: true, name: true, code: true } } },
    });
    return Response.json({ success: true, data: line }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

    const existing = await prisma.feesMasterLine.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Master line not found", 404);

    const amount = body.amount !== undefined ? Number(body.amount) : undefined;
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
      throw new ApiError("amount must be a non-negative integer (paisa)", 400);
    }

    const line = await prisma.feesMasterLine.update({
      where: { id: body.id },
      data: {
        amount,
        dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
      },
      include: { feeType: { select: { id: true, name: true, code: true } } },
    });
    return Response.json({ success: true, data: line });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
        await assertPermission(user, "fees", "delete");

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feesMasterLine.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Master line not found", 404);

    await prisma.feesMasterLine.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] DELETE failed");
  }
}
