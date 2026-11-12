import QRCode from "qrcode";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { authRateLimit } from "@/lib/auth/rate-limit";
import { readBoundedJson } from "@/lib/school-ai/http";
import { createDropSession } from "@/lib/drop/service";

export const runtime = "nodejs";

// SKAI-1847: open a phone upload for the page the signed-in user is on. The link rides in the URL fragment.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    if (!(await authRateLimit(`drop:create:${user.schoolId}:${user.userId}`, { limit: 20, windowMs: 300_000 })).ok) throw new ApiError("Please wait a moment before showing another code.", 429);
    const { session, ticket } = await createDropSession(user, await readBoundedJson(request, 4000));
    const url = `${new URL(request.url).origin}/drop#${ticket}`;
    const qr = await QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M" });
    return Response.json({ success: true, data: { session, url, qr } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[drop/sessions] POST failed"); }
}
