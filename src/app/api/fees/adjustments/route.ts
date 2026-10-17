import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertPermission, assertSharedModuleRead, assertStaffRole, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { decideAdjustment, familyAdjustment, recordDisbursement, requestAdjustment, type AdjustmentKind } from "@/lib/fees/adjustments-service";

// SKO-433: GET lists adjustments (staff: all for the campus or an invoice; families: decided outcomes
// for their own child, without staff reasons or notes). POST requests one. PATCH decides or records a
// refund's disbursement.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const invoiceId = req.nextUrl.searchParams.get("invoiceId");
    if (user.role === "PARENT" || user.role === "STUDENT") {
      await assertSharedModuleRead(user, "fees");
      if (!invoiceId) throw new ApiError("invoiceId required", 400);
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, student: studentScope(user, "finances") }, select: { id: true } });
      if (!invoice) throw new ApiError("Invoice not found", 404);
      const rows = await prisma.financialAdjustment.findMany({ where: { invoiceId }, orderBy: { createdAt: "desc" } });
      return Response.json({ success: true, data: rows.map(familyAdjustment).filter(Boolean) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    assertStaffRole(user);
    await assertPermission(user, "fees", "view");
    const status = req.nextUrl.searchParams.get("status");
    const rows = await prisma.financialAdjustment.findMany({
      where: { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), ...(invoiceId ? { invoiceId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    return Response.json({ success: true, data: rows.map(row => ({ ...row, mine: row.requesterId === user.userId, createdAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null, executedAt: row.executedAt?.toISOString() ?? null })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[fees/adjustments] GET failed"); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "add");
    const body = await req.json();
    const created = await requestAdjustment(user, { kind: String(body.kind) as AdjustmentKind, invoiceId: String(body.invoiceId ?? ""), paymentId: typeof body.paymentId === "string" ? body.paymentId : null, amount: Number(body.amount), reasonCategory: String(body.reasonCategory ?? ""), reason: String(body.reason ?? ""), publicExplanation: String(body.publicExplanation ?? ""), privateNote: typeof body.privateNote === "string" ? body.privateNote : null, idempotencyKey: String(body.idempotencyKey ?? "") });
    return Response.json({ success: true, data: created }, { status: 201 });
  } catch (error) { return errorResponse(error, "[fees/adjustments] POST failed"); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "fees", "edit");
    const body = await req.json();
    const id = String(body.id ?? "");
    const result = body.action === "approve" || body.action === "decline" ? await decideAdjustment(user, id, body.action)
      : body.action === "disbursed" || body.action === "failed" ? await recordDisbursement(user, id, body.action === "disbursed" ? "confirmed" : "failed", String(body.reference ?? ""))
      : null;
    if (!result) throw new ApiError("action must be approve, decline, disbursed or failed", 400);
    return Response.json({ success: true, data: result });
  } catch (error) { return errorResponse(error, "[fees/adjustments] PATCH failed"); }
}
