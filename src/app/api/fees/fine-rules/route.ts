import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId, scopedCampusWhere } from "@/lib/api/scope";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const rules = await prisma.feeFineRule.findMany({
      where: { ...scopedCampusWhere(user, campusId) },
      orderBy: { name: "asc" },
    });
    return Response.json({ success: true, data: rules });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "").toUpperCase();

    if (!name) throw new ApiError("name required", 400);
    if (!["PERCENT", "FLAT", "PER_DAY"].includes(type)) throw new ApiError("type must be PERCENT, FLAT or PER_DAY", 400);

    const value = Number(body.value);
    if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
    if (type === "PERCENT" && value > 100) throw new ApiError("percent fine cannot exceed 100", 400);

    const graceDays = Math.max(0, Math.round(Number(body.graceDays ?? 0)));

    const existing = await prisma.feeFineRule.findFirst({ where: { campusId, name } });
    if (existing) throw new ApiError("A fine rule with this name already exists", 409);

    const rule = await prisma.feeFineRule.create({
      data: { campusId, name, type, value, graceDays, isActive: body.isActive !== false },
    });
    return Response.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("id required", 400);

    const existing = await prisma.feeFineRule.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fine rule not found", 404);

    const type = body.type !== undefined ? String(body.type).toUpperCase() : existing.type;
    if (!["PERCENT", "FLAT", "PER_DAY"].includes(type)) throw new ApiError("type must be PERCENT, FLAT or PER_DAY", 400);

    const value = body.value !== undefined ? Number(body.value) : existing.value;
    if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
    if (type === "PERCENT" && value > 100) throw new ApiError("percent fine cannot exceed 100", 400);

    const rule = await prisma.feeFineRule.update({
      where: { id: body.id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        type,
        value,
        graceDays: body.graceDays !== undefined ? Math.max(0, Math.round(Number(body.graceDays))) : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    });
    return Response.json({ success: true, data: rule });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const existing = await prisma.feeFineRule.findFirst({ where: { id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fine rule not found", 404);

    await prisma.feeFineRule.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] DELETE failed");
  }
}