import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { decideFamilyConsent, listFamilyTransfers } from "@/lib/learning/transfer";

// SKO-471: a guardian consents to (or withdraws) the use of a child's records from another school.
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { return Response.json({ success: true, data: await listFamilyTransfers(await requireAuthUser()) }, { headers }); }
  catch (error) { return errorResponse(error, "[family/transfers] GET failed"); }
}
const Body = z.object({ action: z.enum(["grant", "revoke"]), data: z.unknown() }).strict();
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const user = await requireAuthUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("Invalid consent request", 400);
    return Response.json({ success: true, data: await decideFamilyConsent(user, parsed.data.data, parsed.data.action === "grant" ? "GRANT" : "REVOKE") }, { headers });
  } catch (error) { return errorResponse(error, "[family/transfers] POST failed"); }
}
