import { NextRequest } from "next/server";
import { requireSchoolAiUser, SchoolAiError } from "@/lib/school-ai/access";
import { getWorkspaceRecord } from "@/lib/school-ai/repository";
import { paperDataSchema } from "@/lib/school-ai/assessment";
import { buildCandidatePaperHtml } from "@/lib/school-ai/paper-print";
import { schoolAiError } from "@/lib/school-ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSchoolAiUser();
    const { id } = await context.params;
    const versionText = request.nextUrl.searchParams.get("version") ?? "";
    const version = Number(versionText);
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version) || version < 1) throw new SchoolAiError("Choose the saved approved paper version.");
    const record = await getWorkspaceRecord(user, id);
    if (record.kind !== "PAPER") throw new SchoolAiError("Only candidate papers can be printed here.", 400);
    if (record.status !== "APPROVED" || record.version !== version) throw new SchoolAiError("This paper changed. Reload and select the current approved version before printing.", 409, "STALE_WORKSPACE_VERSION");
    return new Response(buildCandidatePaperHtml(paperDataSchema.parse(record.data), version), { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), display-capture=()",
    } });
  } catch (error) { return schoolAiError(error); }
}
