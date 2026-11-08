import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { portfolio, sharedCollection } from "@/lib/portfolio/service";
import { getDisplayLocale } from "@/lib/locale/display";
import { renderPortfolioExport, type ExportEntry } from "@/lib/portfolio/export-html";

export const runtime = "nodejs";

// SKO-427: an accessible, text-only evidence collection generated at request time (never cached), so a
// revoked or expired share or a withdrawn entry cannot reappear through an old export. Each item names its
// source, version and dates; staff notes, unreturned feedback and files are not included.
// SKAI-1754: rendered in the viewer's display language (the same source the portfolio screen uses).
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const share = request.nextUrl.searchParams.get("share");
    const data = share ? await sharedCollection(user, share) : await portfolio(user, request.nextUrl.searchParams.get("studentId"));
    const title = "title" in data ? data.title : null, learner = "entries" in data && "student" in data ? (typeof data.student === "string" ? data.student : data.student.name) : "";
    const entries = (data.entries as unknown as ExportEntry[]).filter(e => share || e.status === "APPROVED");
    const { language } = await getDisplayLocale({ userId: user.userId, schoolId: user.schoolId, campusId: user.campusId ?? null, role: user.role });
    const html = renderPortfolioExport({ title, learner, entries }, language);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="portfolio.html"` } });
  } catch (error) { return errorResponse(error, "[portfolio/export] GET failed"); }
}
