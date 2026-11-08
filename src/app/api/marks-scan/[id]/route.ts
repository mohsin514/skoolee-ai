import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { addPage, approveBatch, batchView, commitBatch, pageImage, reverseBatch, reviewCell } from "@/lib/marks-scan/service";

export const runtime = "nodejs";

// SKO-412: one scan. GET (review view) or ?image=<pageId> (the page photo, for staff on the exam only)
// POST {action: page | review | approve | commit | reverse, ...}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const image = request.nextUrl.searchParams.get("image");
    if (image) { const page = await pageImage(user, id, image); return privateDownloadResponse(page.storageKey, page.fileName, { contentType: page.contentType, inlineImage: true }); }
    return Response.json({ success: true, data: await batchView(user, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[marks-scan/id] GET failed"); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const run = { page: () => addPage(user, id, body), review: () => reviewCell(user, id, body), approve: () => approveBatch(user, id, body), commit: () => commitBatch(user, id, body), reverse: () => reverseBatch(user, id) }[String(body.action) as "page"];
    if (!run) throw new ApiError("Unknown action", 400);
    return Response.json({ success: true, data: await run() });
  } catch (error) { return errorResponse(error, "[marks-scan/id] POST failed"); }
}
