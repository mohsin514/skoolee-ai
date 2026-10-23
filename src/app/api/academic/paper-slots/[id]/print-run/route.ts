import { NextRequest } from "next/server";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { printRun } from "@/lib/school-ai/paper-sitting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SKO-503: covers for one date-sheet row (QR per candidate), recorded as a print run of the sealed paper.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scheduleId = req.nextUrl.searchParams.get("scheduleId") ?? "";
    const lang = req.nextUrl.searchParams.get("lang");
    const html = await printRun(await requireAuthUser(), (await ctx.params).id, scheduleId, lang === "ar" || lang === "ur" ? lang : "en");
    return new Response(html, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) { return errorResponse(error, "[paper-slots/:id/print-run] GET failed"); }
}
