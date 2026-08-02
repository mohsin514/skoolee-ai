import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { generatePaymentPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const payment = await prisma.payment.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true, receiptNo: true },
    });
    if (!payment) throw new ApiError("Payment not found", 404);

    await resolveCampusId(user, payment.campusId);

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
