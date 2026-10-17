import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, assertSharedModuleRead, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { generatePaymentPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // SKO-431: a guardian with finance access, or the pupil, can download their own receipts at any time.
    const family = user.role === "PARENT" || user.role === "STUDENT";
    if (family) await assertSharedModuleRead(user, "fees");
    else if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const payment = await prisma.payment.findFirst({
      where: family ? { id, student: studentScope(user, "finances") } : { id, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true, receiptNo: true },
    });
    if (!payment) throw new ApiError("Payment not found", 404);

    if (!family) await resolveCampusId(user, payment.campusId);

    const buffer = await generatePaymentPdf(id);
    const receiptNo = (payment.receiptNo || id).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${receiptNo}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/payment-pdf] failed");
  }
}
