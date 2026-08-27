import { NextRequest } from "next/server";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { generateReportCardPdf, renderReportCardPdfBuffer } from "@/lib/academic/pdf";

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
}): Promise<string | null> {
  if (reportCard.pdfUrl && isLocalPdfValid(reportCard.pdfUrl)) {
    return reportCard.pdfUrl;
  }

  // Null where the host has nowhere to write — the caller falls back to the
  // streaming endpoint rather than treating it as a failure.
  const pdfUrl = await generateReportCardPdf(reportCard.id);
  if (pdfUrl) {
    await prisma.reportCard.update({
      where: { id: reportCard.id },
      data: { pdfUrl },
    });
  }

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

    // `?redirect=1` means "give me the file", not "give me a link to it"
    // (§83, §84).
    //
    // Two separate failures led here. First, the JSON form forced the caller
    // to `await` the response and only then call `window.open`, by which point
    // the click's user-gesture status was gone and popup blockers silently
    // swallowed the window. Second — and this is why it failed in production
    // but never on a laptop — the JSON form hands back a path under
    // /generated/, which only exists if the PDF could be written to disk. On a
    // serverless host the bundle directory is read-only, so that write dies
    // with `ENOENT: mkdir '/var/task/public/generated'` and the download never
    // had a file to point at.
    //
    // Streaming the bytes sidesteps both. The PDF is already rendered in
    // memory; persisting it was only ever a cache.
    const wantsFile = req.nextUrl.searchParams.get("redirect") === "1";

    if (wantsFile) {
      // A stored copy is used when there is one and it is still valid;
      // otherwise the document is rendered fresh for this request.
      if (reportCard.pdfUrl && !reportCard.pdfUrl.startsWith("/")) {
        const { reportCardKey, getDownloadUrl } = await import("@/lib/storage/s3");
        const key = reportCardKey(reportCard.campusId, reportCard.examId, reportCard.studentId);
        return Response.redirect(await getDownloadUrl(key, 86400), 302);
      }

      const { buffer, filename } = await renderReportCardPdfBuffer(reportCard.id);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": String(buffer.length),
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (reportCard.pdfUrl && !reportCard.pdfUrl.startsWith("/")) {
      const { reportCardKey, getDownloadUrl } = await import("@/lib/storage/s3");
      const key = reportCardKey(reportCard.campusId, reportCard.examId, reportCard.studentId);
      const freshUrl = await getDownloadUrl(key, 86400);
      return Response.json({ success: true, pdfUrl: freshUrl });
    }

    // Callers still on the JSON contract get a URL when one can exist, and the
    // streaming endpoint itself when the host cannot store files.
    const pdfUrl = await freshDownloadUrl(reportCard);
    return Response.json({
      success: true,
      pdfUrl: pdfUrl ?? `/api/reports/download?reportCardId=${reportCard.id}&redirect=1`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    return Response.json({ error: message }, { status: 500 });
  }
}
