import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { downloadExport } from "@/lib/data-lifecycle/service";

export const dynamic = "force-dynamic";

// The token travels in the body so it never lands in URLs, logs or browser history.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const { token } = await req.json().catch(() => ({ token: null }));
    if (typeof token !== "string" || !token) throw new ApiError("Export not found.", 404);
    const artifact = await downloadExport(user, id, token);
    return new Response(JSON.stringify(artifact, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="learner-export-${id}.json"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    const response = errorResponse(error, "[data-lifecycle] download failed");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
