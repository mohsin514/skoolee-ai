import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import * as transport from "@/lib/transport/service";

export const runtime = "nodejs";

// SKO-437: route detail, stops and riders for coordinators. GET ?routeId= | ?q= ·
// POST {action: assign | unassign | stop | vehicles}.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const p = request.nextUrl.searchParams, headers = { "Cache-Control": "private, no-store" };
    if (p.get("routeId")) return Response.json({ success: true, data: await transport.routeDetail(user, p.get("routeId")!) }, { headers });
    return Response.json({ success: true, data: await transport.findStudents(user, p.get("q") ?? "") }, { headers });
  } catch (error) { return errorResponse(error, "[transport/riders] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (body.action) {
      case "assign": return Response.json({ success: true, data: await transport.assignRider(user, body) });
      case "unassign": return Response.json({ success: true, data: await transport.unassignRider(user, String(body.studentId ?? "")) });
      case "stop": return Response.json({ success: true, data: await transport.saveStop(user, body) }, { status: body.id ? 200 : 201 });
      case "vehicles": return Response.json({ success: true, data: await transport.setRouteVehicles(user, String(body.routeId ?? ""), Array.isArray(body.vehicleIds) ? body.vehicleIds.map(String) : []) });
      default: throw new ApiError("Unknown action", 400);
    }
  } catch (error) { return errorResponse(error, "[transport/riders] POST failed"); }
}
