import { NextRequest } from "next/server";
import { ApiError, requireAuthUser } from "@/lib/api/scope";
import { failFrom, ok } from "@/lib/api/envelope";
import { addRestriction, findStudents, history, liftRestriction } from "@/lib/pickup/service";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

// SKO-438: restrictions and release history (campus leaders). GET ?q= (find) or ?studentId= (history) ·
// POST {action: add | lift}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams;
    if (p.get("studentId")) return ok(await history(user, p.get("studentId")!), { headers });
    return ok(await findStudents(user, p.get("q") ?? ""), { headers });
  } catch (error) { return failFrom(error, "[pickup/restrictions] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "add") return ok({ id: (await addRestriction(user, body)).id }, { status: 201 });
    if (body.action === "lift") return ok(await liftRestriction(user, String(body.id ?? "")));
    throw new ApiError("Unknown action", 400);
  } catch (error) { return failFrom(error, "[pickup/restrictions] POST failed"); }
}
