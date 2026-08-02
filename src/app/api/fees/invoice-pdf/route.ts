import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { generateInvoicePdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const invoice = await prisma.invoice.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true, invoiceNumber: true },
    });
    if (!invoice) throw new ApiError("Invoice not found", 404);

    await resolveCampusId(user, invoice.campusId);

    const buffer = await generateInvoicePdf(id);
    const invoiceNumber = (invoice.invoiceNumber || id).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    return errorResponse(error, "[fees/invoice-pdf] failed");
  }
}
