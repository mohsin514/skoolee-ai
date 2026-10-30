import { ApiError, errorResponse, requirePlatformOwner } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { buildCostReport, costReportCsv, saveCostRates } from "@/lib/owner/ai-cost-report";
import { readJsonBody } from "@/lib/api/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

// SKAI-1042: AI cost per credit per school and month. GET ?months=1..24[&format=csv]; PUT {usdPerMillionTokens, pkrPerUsd}.
export async function GET(request: Request) {
  try {
    await requirePlatformOwner();
    const params = new URL(request.url).searchParams;
    const months = Number(params.get("months") ?? 6);
    const report = await buildCostReport(months);
    if (params.get("format") === "csv") {
      return new Response(costReportCsv(report.rows), { headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ai-cost-per-credit-${new Date().toISOString().slice(0, 10)}.csv"` } });
    }
    return Response.json({ success: true, data: report }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[owner/ai-cost-report] GET failed"); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await requirePlatformOwner();
    const body = await readJsonBody(request);
    return Response.json({ success: true, data: await saveCostRates(owner.userId, body) }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[owner/ai-cost-report] PUT failed"); }
}
