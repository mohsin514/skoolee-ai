import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createFineRule } from "@/lib/fees/fine-rule-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

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
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "add");

    const body = await parseBody(req, jsonObjectBody);
    const rule = await createFineRule(user, body);
    return Response.json({ success: true, data: rule }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await parseBody(req, idBody);

    const existing = await prisma.feeFineRule.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Fine rule not found", 404);

    const type = body.type !== undefined ? String(body.type).toUpperCase() : existing.type;
    if (!["PERCENT", "FLAT", "PER_DAY"].includes(type)) throw new ApiError("type must be PERCENT, FLAT or PER_DAY", 400);

    const value = body.value !== undefined ? Number(body.value) : existing.value;
    if (!Number.isInteger(value) || value < 0) throw new ApiError("value must be a non-negative integer", 400);
    if (type === "PERCENT" && value > 100) throw new ApiError("percent fine cannot exceed 100", 400);

    const rule = await prisma.$transaction(async (tx) => {
      const next = await tx.feeFineRule.update({
        where: { id: body.id },
        data: {
          name: body.name !== undefined ? String(body.name).trim() : undefined,
          type,
          value,
          graceDays: body.graceDays !== undefined ? Math.max(0, Math.round(Number(body.graceDays))) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
        },
      });
      await writeAuditEvent(tx, user, { table: "fee_fine_rules", recordId: next.id, action: "UPDATE", campusId: existing.campusId, before: { type: existing.type, value: existing.value, graceDays: existing.graceDays, isActive: existing.isActive }, after: { type: next.type, value: next.value, graceDays: next.graceDays, isActive: next.isActive } });
      return next;
    });
    return Response.json({ success: true, data: rule });
  } catch (error) {
    return errorResponse(error, "[fees/fine-rules] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "fees/fine-rules");
}
