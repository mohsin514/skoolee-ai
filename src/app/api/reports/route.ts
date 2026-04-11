// GET  /api/reports?examId= — Get report cards for exam
// PATCH /api/reports/[id]   — Edit remarks
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId");
  if (!examId) return Response.json({ error: "examId required" }, { status: 400 });

  const reportCards = await prisma.reportCard.findMany({
    where: { examId },
    include: {
      student: { select: { fullName: true, rollNo: true } },
    },
    orderBy: { student: { rollNo: "asc" } },
  });

  return Response.json({ success: true, reportCards });
}
