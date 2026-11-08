import { NextRequest } from "next/server";
import { requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { created, failFrom, ok } from "@/lib/api/envelope";
import { cancelTrip, createTrip, reviseTrip, staffTrips, tripRoster } from "@/lib/family/trips";

// SKO-421: trip notices and permission. GET ?campusId= (list) or ?id= (roster with every answer)
// POST {title, destination, departAt, returnAt, costAmount, costCurrency, contact, instructions, consentKind, signatoryRule, respondBy, studentIds}
// PATCH {id, action: revise (terms + knownVersion, material, changeNote) | cancel}
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const id = request.nextUrl.searchParams.get("id");
    if (id) return ok(await tripRoster(user, id));
    const campusId = await resolveCampusId(user, user.role === "SUPER_ADMIN" ? request.nextUrl.searchParams.get("campusId") : user.campusId);
    return ok(await staffTrips(user, campusId));
  } catch (error) { return failFrom(error, "[trips] GET failed"); }
}
export async function POST(request: NextRequest) {
  try { const user = await requireAuthUser(); return created(await createTrip(user, await request.json().catch(() => ({})))); }
  catch (error) { return failFrom(error, "[trips] POST failed"); }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = String(body.id ?? "");
    const data = body.action === "cancel" ? await cancelTrip(user, id) : await reviseTrip(user, id, body);
    return ok(data);
  } catch (error) { return failFrom(error, "[trips] PATCH failed"); }
}
