import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { generateClassGradesPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canViewGrades(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canViewGrades(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) return Response.json({ error: "classId is required" }, { status: 400 });

  const cls = await prisma.class.findFirst({
    where: { id: classId, campus: { schoolId: user.schoolId } },
    select: { id: true, campusId: true, name: true, section: true },
  });
  if (!cls) return Response.json({ error: "Class not found" }, { status: 404 });
  if (user.campusId && cls.campusId !== user.campusId) {
    return Response.json({ error: "Class is outside your campus" }, { status: 403 });
  }

  try {
    const buffer = await generateClassGradesPdf(classId);
    const className = [cls.name, cls.section].filter(Boolean).join(" ").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="final-grades-${className || "class"}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    return Response.json({ error: message }, { status: 500 });
  }
}
