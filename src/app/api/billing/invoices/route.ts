// GET /api/billing/invoices — List invoices for current campus
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const campusId = searchParams.get("campusId") || user.campusId;
  const status = searchParams.get("status");
  const term = searchParams.get("term");

  const invoices = await prisma.invoice.findMany({
    where: {
      campusId: campusId || undefined,
      ...(status ? { status: status as any } : {}),
      ...(term ? { term } : {}),
    },
    include: {
      student: {
        select: {
          fullName: true,
          rollNo: true,
          class: { select: { name: true } },
        },
      },
      payments: { select: { amountPaid: true, method: true, paidAt: true } },
    },
    orderBy: { generatedAt: "desc" },
  });

  return Response.json({ success: true, invoices });
}
