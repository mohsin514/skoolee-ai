import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { addRestriction, findStudents, history, liftRestriction } from "@/lib/pickup/service";

export const runtime = "nodejs";

// SKO-438: restrictions and release history (campus leaders). GET ?q= (find) or ?studentId= (history) ·
// POST {action: add | lift}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams, headers = { "Cache-Control": "private, no-store" };
    if (p.get("studentId")) return Response.json({ success: true, data: await history(user, p.get("studentId")!) }, { headers });
    return Response.json({ success: true, data: await findStudents(user, p.get("q") ?? "") }, { headers });
  } catch (error) { return errorResponse(error, "[pickup/restrictions] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === "add") return Response.json({ success: true, data: { id: (await addRestriction(user, body)).id } }, { status: 201 });
    if (body.action === "lift") return Response.json({ success: true, data: await liftRestriction(user, String(body.id ?? "")) });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[pickup/restrictions] POST failed"); }
}
