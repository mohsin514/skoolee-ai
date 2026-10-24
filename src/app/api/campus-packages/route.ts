import { z } from "zod";
import { errorResponse, requireAuthUser } from "@/lib/api/scope";
import { assertSameOrigin } from "@/lib/auth/same-origin";
import { addMenuItem, approveLeave, boardingOverview, canteenOverview, decideOrder, disablePackage, enablePackage, familyCanteen, leaveHandover, packageStates, packagesOverview, placeOrder, recordDietary, resolveException, reviewDietary, setSpendLimit, setupPackage, takeRollCall } from "@/lib/campus-packages/service";

// SKO-456: optional campus packages — setup and enablement, canteen, dietary records and boarding operations.
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser();
    const view = new URL(request.url).searchParams.get("view");
    const data = view === "states" ? await packageStates(user) : view === "canteen" ? await canteenOverview(user) : view === "boarding" ? await boardingOverview(user) : view === "family" ? await familyCanteen(user) : await packagesOverview(user);
    return Response.json({ success: true, data }, { headers });
  } catch (error) { return errorResponse(error, "[campus-packages] GET failed"); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser();
    const body = z.object({ action: z.enum(["setup", "enable", "disable", "menu-item", "limit", "dietary", "dietary-review", "order", "order-decision", "leave", "leave-handover", "roll-call", "resolve-exception"]), id: z.string().min(1).max(120).optional(), data: z.unknown().optional() }).strict().parse(await request.json().catch(() => ({})));
    const id = body.id ?? "";
    const run = (): Promise<unknown> => {
      switch (body.action) {
        case "setup": return setupPackage(user, body.data);
        case "enable": return enablePackage(user, body.data);
        case "disable": return disablePackage(user, body.data);
        case "menu-item": return addMenuItem(user, body.data);
        case "limit": return setSpendLimit(user, body.data);
        case "dietary": return recordDietary(user, body.data);
        case "dietary-review": return reviewDietary(user, id, body.data);
        case "order": return placeOrder(user, body.data);
        case "order-decision": return decideOrder(user, id, body.data);
        case "leave": return approveLeave(user, body.data);
        case "leave-handover": return leaveHandover(user, id, body.data);
        case "roll-call": return takeRollCall(user, body.data);
        default: return resolveException(user, id, body.data);
      }
    };
    return Response.json({ success: true, data: await run() }, { headers });
  } catch (error) { return errorResponse(error, "[campus-packages] POST failed"); }
}
