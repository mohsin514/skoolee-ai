import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { portfolio, sharedCollection } from "@/lib/portfolio/service";

export const runtime = "nodejs";

// SKO-427: an accessible, text-only evidence collection generated at request time (never cached), so a
// revoked or expired share or a withdrawn entry cannot reappear through an old export. Each item names its
// source, version and dates; staff notes, unreturned feedback and files are not included.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
type Source = { title: string; version: number; assignmentVersion: number; rubricVersion: number; receiptCode: string; submittedAt: string | Date; text: string; file: { name: string } | null; feedback: { comment: string; returnedAt: string | Date | null; criteria: { title: string; points: number | null; maxPoints: number; comment: string }[] } | null } | null | undefined;
const source = (label: string, s: Source) => !s ? `<p><strong>${esc(label)}:</strong> this work is no longer available.</p>` : `<section><h3>${esc(label)}: ${esc(s.title)}</h3><p>Version ${s.version} (assignment version ${s.assignmentVersion}, rubric version ${s.rubricVersion}) · receipt ${esc(s.receiptCode)} · submitted ${esc(new Date(s.submittedAt).toISOString().slice(0, 10))}</p>${s.text ? `<blockquote>${esc(s.text)}</blockquote>` : ""}${s.file ? `<p>Attached file: ${esc(s.file.name)} (kept in the school's records)</p>` : ""}${s.feedback ? `<h4>Returned feedback (${esc(s.feedback.returnedAt ? new Date(s.feedback.returnedAt).toISOString().slice(0, 10) : "")})</h4><p>${esc(s.feedback.comment)}</p><ul>${s.feedback.criteria.map(c => `<li>${esc(c.title)}: ${c.points ?? "—"} of ${c.maxPoints}${c.comment ? ` — ${esc(c.comment)}` : ""}</li>`).join("")}</ul>` : ""}</section>`;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const share = request.nextUrl.searchParams.get("share");
    const data = share ? await sharedCollection(user, share) : await portfolio(user, request.nextUrl.searchParams.get("studentId"));
    const title = "title" in data ? data.title : "Learning portfolio", learner = "entries" in data && "student" in data ? (typeof data.student === "string" ? data.student : data.student.name) : "";
    const entries = (data.entries as unknown as { title: string; goal: { code?: string; title?: string }; status: string; reflection: string | null; teacherComment: string | null; earlier: Source; later: Source; comparison: { comparable: boolean } | null }[]).filter(e => share || e.status === "APPROVED");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(learner)}</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}blockquote{border-inline-start:3px solid #ccc;margin:0;padding-inline-start:1rem;white-space:pre-wrap}</style></head><body><h1>${esc(title)}</h1><p>${esc(learner)} · generated ${new Date().toISOString().slice(0, 10)}. Only reviewed entries are included.</p>${entries.map(e => `<article><h2>${esc(e.title)}</h2><p>Learning goal: ${e.goal?.title ? `${esc(e.goal.code)} ${esc(e.goal.title)}` : "not linked to an objective"}</p>${source("Earlier work", e.earlier)}${e.later !== undefined ? source("Later work", e.later) : ""}${e.comparison && !e.comparison.comparable ? "<p><strong>Note:</strong> the rubric changed between these pieces of work, so their criteria are not compared directly.</p>" : ""}<h3>Reflection</h3><p>${esc(e.reflection ?? "")}</p>${e.teacherComment ? `<h3>Teacher comment</h3><p>${esc(e.teacherComment)}</p>` : ""}</article>`).join("")}</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="portfolio.html"` } });
  } catch (error) { return errorResponse(error, "[portfolio/export] GET failed"); }
}
