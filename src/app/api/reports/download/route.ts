import { getPublishedVersion, getArtifactVersion } from "@/lib/academic/report-versions";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { AccessDenied, publishedReportsWhere, reportScope } from "@/lib/auth/policy";
import { assertSharedModuleRead, errorResponse } from "@/lib/api/scope";
import { withParentScope } from "@/lib/parent/resolve-child";
import { renderReportCardPdfBuffer } from "@/lib/academic/pdf";

export const runtime = "nodejs";

async function download(req: NextRequest, scope: Prisma.ReportCardWhereInput, staff = false) {
  const reportCardId = req.nextUrl.searchParams.get("reportCardId");
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!reportCardId && !studentId) throw new AccessDenied("report");
  const report = await prisma.reportCard.findFirst({
    where: { AND: [scope, reportCardId ? { id: reportCardId } : { studentId: studentId! }] },
    orderBy: { generatedAt: "desc" }, select: { id: true },
  });
  if (!report) throw new AccessDenied("report");
  const requested = req.nextUrl.searchParams.get("versionId") || undefined;
  const version = staff && requested ? await getArtifactVersion(report.id, requested) : await getPublishedVersion(report.id, requested);
  if (req.nextUrl.searchParams.get("redirect") !== "1") {
    const query = new URLSearchParams({ reportCardId: report.id, versionId: version.id, redirect: "1" });
    const token = req.nextUrl.searchParams.get("token");
    if (token) query.set("token", token);
    return Response.json({ success: true, pdfUrl: `/api/reports/download?${query}` }, { headers: { "Cache-Control": "private, no-store" } });
  }
  // Authorize every download. Public disk paths and day-long presigned links
  // would survive a guardian unlink, staff move or publication withdrawal.
  const { buffer, filename } = await renderReportCardPdfBuffer(report.id, version.id);
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`,
    "X-Report-Version": String(version.number), "X-Report-Superseded": String("superseded" in version && version.superseded),
    "Content-Length": String(buffer.length), "Cache-Control": "private, no-store",
  } });
}

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.has("token")) {
      return await withParentScope(req, ({ studentId, schoolId, permissions }) => {
        if (!permissions.learningRecords) throw new AccessDenied("report");
        return download(req, { schoolId, studentId: studentId!, ...publishedReportsWhere });
      });
    }
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await assertSharedModuleRead(user, "reports");
    return await download(req, reportScope(user), !["PARENT", "STUDENT"].includes(user.role));
  } catch (error) { return errorResponse(error, "Failed to generate PDF"); }
}
