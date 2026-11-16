import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createFineRule, parseFineGraceDays, parseFineIsActive, parseFineName, parseFineType, parseFineValue } from "@/lib/fees/fine-rule-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "view");
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

    const type = body.type !== undefined ? parseFineType(body.type) : existing.type;
    const value = body.value !== undefined ? parseFineValue(body.value, type) : parseFineValue(existing.value, type);
    const name = body.name !== undefined ? parseFineName(body.name) : undefined;
    const graceDays = body.graceDays !== undefined ? parseFineGraceDays(body.graceDays) : undefined;
    const isActive = body.isActive !== undefined ? parseFineIsActive(body.isActive) : undefined;

    if (name !== undefined) {
      const clash = await prisma.feeFineRule.findFirst({ where: { campusId: existing.campusId, id: { not: existing.id }, name: { equals: name, mode: "insensitive" } } });
      if (clash) throw new ApiError("A fine rule with this name already exists", 409);
    }

    const rule = await prisma.$transaction(async (tx) => {
      const next = await tx.feeFineRule.update({
        where: { id: body.id },
        data: {
          name,
          type,
          value,
          graceDays,
          isActive,
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
