import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { handedLibraryCharges } from "@/lib/library/desk";
import { acceptLibraryCharge, returnLibraryCharge } from "@/lib/library/charge-finance";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// SKAI-1665: library charges the lending desk handed to the fees office, for the campus finance desk.
export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await handedLibraryCharges(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[fees/library-charges] GET failed"); }
}

// SKAI-1669: finance accepts a handed charge (posts one linked fee invoice; replays return it) or returns it to the library.
// body: { chargeId, action: "accept" } | { chargeId, action: "return", reason }
export async function POST(req: Request) {
  try {
    const user = await requireAuthUser();
    const body = await parseBody(req, jsonObjectBody);
    const chargeId = String(body.chargeId ?? "");
    if (body.action === "accept") return Response.json({ success: true, data: await acceptLibraryCharge(user, chargeId) });
    if (body.action === "return") return Response.json({ success: true, data: await returnLibraryCharge(user, chargeId, body.reason) });
    return Response.json({ success: false, error: "action must be accept or return" }, { status: 400 });
  } catch (error) { return errorResponse(error, "[fees/library-charges] POST failed"); }
}
