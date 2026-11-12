import { ApiError, errorResponse } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedBytes } from "@/lib/school-ai/http";
import { MAX_DROP_BYTES, addPhoneItem, phoneView, withPhoneSession } from "@/lib/drop/service";

export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store" };
const ticketOf = (request: Request) => request.headers.get("x-drop-ticket") ?? "";

// SKAI-1847: the phone side of Skoolee Drop. No session cookie: the signed link names one open session and only
// allows reading its label and limits (POST) and adding files to it (PUT). It never returns any stored file.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    return Response.json({ success: true, data: await withPhoneSession(ticketOf(request), async session => phoneView(session)) }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[drop/phone] POST failed"); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const result = await withPhoneSession(ticketOf(request), async session => {
      if (!(await authRateLimit(`drop:phone:${session.id}`, { limit: 60, windowMs: 300_000 })).ok) throw new ApiError("Too many uploads. Wait a moment and try again.", 429);
      const bytes = await readBoundedBytes(request, MAX_DROP_BYTES);
      let fileName = "scan";
      try { fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "scan").slice(0, 200); } catch { /* Keep the default name. */ }
      return addPhoneItem(session, { fileName, contentType: request.headers.get("content-type") ?? "", bytes });
    });
    return Response.json({ success: true, data: result }, { headers: noStore });
  } catch (error) { return errorResponse(error, "[drop/phone] PUT failed"); }
}
