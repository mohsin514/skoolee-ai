import { operationDeleteResponse } from "@/lib/destructive/operations";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { createMasterLine } from "@/lib/fees/master-line-command";
import { ApiError, assertPermission, canManageFinance, errorResponse, requireAuthUser, scopedCampusWhere } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

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
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await parseBody(req, jsonObjectBody);
    const line = await createMasterLine(user, body);
    return Response.json({ success: true, data: line }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFinance(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "fees", "edit");

    const body = await parseBody(req, idBody);

    const existing = await prisma.feesMasterLine.findFirst({ where: { id: body.id, ...scopedCampusWhere(user) } });
    if (!existing) throw new ApiError("Master line not found", 404);

    const amount = body.amount !== undefined ? Number(body.amount) : undefined;
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
      throw new ApiError("amount must be a non-negative integer (paisa)", 400);
    }

    const line = await prisma.$transaction(async (tx) => {
      const next = await tx.feesMasterLine.update({
        where: { id: body.id },
        data: {
          amount,
          dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
        },
        include: { feeType: { select: { id: true, name: true, code: true } } },
      });
      await writeAuditEvent(tx, user, { table: "fees_master_lines", recordId: next.id, action: "UPDATE", campusId: existing.campusId, before: { amount: existing.amount, dueDate: existing.dueDate?.toISOString() ?? null }, after: { amount: next.amount, dueDate: next.dueDate?.toISOString() ?? null } });
      return next;
    });
    return Response.json({ success: true, data: line });
  } catch (error) {
    return errorResponse(error, "[fees/master-lines] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  return operationDeleteResponse(req, "fees/master-lines");
}
