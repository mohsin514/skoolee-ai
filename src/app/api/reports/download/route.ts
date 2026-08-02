import { NextRequest } from "next/server";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateReportCardPdf } from "@/lib/academic/pdf";

export const runtime = "nodejs";

function isLocalPdfValid(pdfUrl: string): boolean {
  if (!pdfUrl.startsWith("/")) return true;
  return existsSync(path.join(process.cwd(), "public", pdfUrl));
}

async function freshDownloadUrl(reportCard: {
  id: string;
  pdfUrl: string | null;
  campusId: string;
  examId: string;
  studentId: string;
}) {
  if (reportCard.pdfUrl && isLocalPdfValid(reportCard.pdfUrl)) {
    return reportCard.pdfUrl;
  }

  const pdfUrl = await generateReportCardPdf(reportCard.id);

  await prisma.reportCard.update({
    where: { id: reportCard.id },
    data: { pdfUrl },
  });

  return pdfUrl;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const reportCardId = req.nextUrl.searchParams.get("reportCardId");
    const studentId = req.nextUrl.searchParams.get("studentId");

    let reportCard;

    if (reportCardId) {
      reportCard = await prisma.reportCard.findFirst({
        where: {
          id: reportCardId,
          campus: { schoolId: user.schoolId },
        },
        select: { id: true, pdfUrl: true, campusId: true, examId: true, studentId: true },
      });
    } else if (studentId) {
      reportCard = await prisma.reportCard.findFirst({
        where: {
          studentId,
          campus: { schoolId: user.schoolId },
          status: { in: ["PUBLISHED", "SENT", "REVIEWED", "GENERATED"] },
        },
        orderBy: { generatedAt: "desc" },
        select: { id: true, pdfUrl: true, campusId: true, examId: true, studentId: true },
      });
    }

    if (!reportCard) {
      return Response.json({ error: "No report card found" }, { status: 404 });
    }

    if (reportCard.pdfUrl && !reportCard.pdfUrl.startsWith("/")) {
      const { reportCardKey, getDownloadUrl } = await import("@/lib/storage/s3");
      const key = reportCardKey(reportCard.campusId, reportCard.examId, reportCard.studentId);
      const freshUrl = await getDownloadUrl(key, 86400);
      return Response.json({ success: true, pdfUrl: freshUrl });
    }

    const pdfUrl = await freshDownloadUrl(reportCard);
    return Response.json({ success: true, pdfUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    return Response.json({ error: message }, { status: 500 });
  }
}
