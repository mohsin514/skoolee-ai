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

    // Staff may pull any card in their school, including ones still under
    // review. A family may only pull a released card for their own child —
    // school scope alone would let any student download every classmate's PDF
    // by guessing an id.
    const isFamily = user.role === "STUDENT" || user.role === "PARENT";
    let familyScope: Record<string, unknown> = {};
    if (isFamily) {
      const own = await prisma.student.findMany({
        where:
          user.role === "STUDENT"
            ? { studentUserId: user.userId }
            : { parentUserId: user.userId },
        select: { id: true },
      });
      if (own.length === 0) {
        return Response.json({ error: "No report card found" }, { status: 404 });
      }
      familyScope = {
        studentId: { in: own.map((s) => s.id) },
        status: { in: ["PUBLISHED", "SENT"] },
      };
    }

    let reportCard;

    if (reportCardId) {
      reportCard = await prisma.reportCard.findFirst({
        where: {
          id: reportCardId,
          campus: { schoolId: user.schoolId },
          ...familyScope,
        },
        select: { id: true, pdfUrl: true, campusId: true, examId: true, studentId: true },
      });
    } else if (studentId) {
      reportCard = await prisma.reportCard.findFirst({
        where: {
          studentId,
          campus: { schoolId: user.schoolId },
          status: { in: ["PUBLISHED", "SENT", "REVIEWED", "GENERATED"] },
          ...familyScope,
        },
        orderBy: { generatedAt: "desc" },
        select: { id: true, pdfUrl: true, campusId: true, examId: true, studentId: true },
      });
    }

    if (!reportCard) {
      return Response.json({ error: "No report card found" }, { status: 404 });
    }

    // `?redirect=1` sends the browser straight to the file instead of handing
    // back JSON (§83).
    //
    // The JSON form forces the caller to `await` the response and only then
    // call `window.open`, by which point the click's user-gesture status is
    // gone and every popup blocker silently swallows the window. The report
    // card button did exactly that, so the PDF was built on the server and
    // then never shown — indistinguishable, from the user's side, from the
    // PDF failing to generate. A redirect lets the button be a plain link.
    const wantsRedirect = req.nextUrl.searchParams.get("redirect") === "1";

    if (reportCard.pdfUrl && !reportCard.pdfUrl.startsWith("/")) {
      const { reportCardKey, getDownloadUrl } = await import("@/lib/storage/s3");
      const key = reportCardKey(reportCard.campusId, reportCard.examId, reportCard.studentId);
      const freshUrl = await getDownloadUrl(key, 86400);
      return wantsRedirect
        ? Response.redirect(freshUrl, 302)
        : Response.json({ success: true, pdfUrl: freshUrl });
    }

    const pdfUrl = await freshDownloadUrl(reportCard);
    if (wantsRedirect) {
      return Response.redirect(new URL(pdfUrl, req.nextUrl.origin), 302);
    }
    return Response.json({ success: true, pdfUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    return Response.json({ error: message }, { status: 500 });
  }
}
