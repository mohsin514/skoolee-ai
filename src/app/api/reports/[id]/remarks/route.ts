import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { reportRemarkSchema } from "@/lib/validators/schemas";

export const runtime = "nodejs";

function canEditRemarks(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canEditRemarks(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = reportRemarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const reportCard = await prisma.reportCard.findFirst({
      where: { id, campus: { schoolId: user.schoolId } },
      include: { exam: { select: { campusId: true } } },
    });

    if (!reportCard) return Response.json({ error: "Report card not found" }, { status: 404 });
    if (user.campusId && reportCard.exam.campusId !== user.campusId) {
      return Response.json({ error: "Report card is outside your campus" }, { status: 403 });
    }

    const remarksChanged =
      parsed.data.remarksEn !== undefined || parsed.data.remarksUr !== undefined;

    const updated = await prisma.reportCard.update({
      where: { id },
      data: {
        ...(parsed.data.remarksEn !== undefined ? { remarksEn: parsed.data.remarksEn || null } : {}),
        ...(parsed.data.remarksUr !== undefined ? { remarksUr: parsed.data.remarksUr || null } : {}),
        ...(remarksChanged
          ? {
              remarksApproved: false,
              approvedBy: null,
              approvedAt: null,
              pdfUrl: null,
              status: "GENERATED",
            }
          : {}),
      },
    });

    return Response.json({ success: true, reportCard: updated });
  } catch (error) {
    console.error("[reports/[id]/remarks] PATCH failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
