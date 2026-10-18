import { NextRequest } from "next/server";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { decideException, escalate, gateQueue, release, scan } from "@/lib/pickup/service";
import { deliverNotification } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

// SKO-438: gate verification. GET → today's checks · POST {action: scan | release | escalate | decide}.
export async function GET() {
  try {
    const user = await requireAuthUser();
    return Response.json({ success: true, data: await gateQueue(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error, "[pickup/gate] GET failed"); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const headers = { "Cache-Control": "private, no-store" };
    const tell = (event: string, campusId: string, recipientIds: string[]) => recipientIds.length ? deliverNotification(event, { schoolId: user.schoolId, campusId, actorId: user.userId, recipientIds }).catch(error => console.error(`[pickup] ${event} failed`, error)) : Promise.resolve();
    if (body.action === "scan") return Response.json({ success: true, data: await scan(user, body) }, { headers });
    if (body.action === "release") {
      const result = await release(user, body);
      if (result.status === "RELEASED" && !result.repeated && "notifyGuardian" in result && result.notifyGuardian) await tell("PICKUP_RELEASED", user.campusId ?? "", [String(result.notifyGuardian)]);
      const { notifyGuardian: _n, ...data } = result as typeof result & { notifyGuardian?: string };
      return Response.json({ success: true, data }, { headers });
    }
    if (body.action === "escalate") {
      const result = await escalate(user, body);
      // The designated lead, or the campus leaders when none is named.
      const leads = result.leadUserId ? [result.leadUserId] : (await prisma.user.findMany({ where: { schoolId: user.schoolId, campusId: result.campusId, isActive: true, role: { in: ["PRINCIPAL", "CAMPUS_ADMIN"] } }, select: { id: true } })).map(u => u.id);
      await tell("PICKUP_EXCEPTION_REQUESTED", result.campusId, leads.filter(id => id !== user.userId));
      return Response.json({ success: true, data: { checkId: result.checkId } }, { headers });
    }
    if (body.action === "decide") return Response.json({ success: true, data: await decideException(user, body) }, { headers });
    throw new ApiError("Unknown action", 400);
  } catch (error) { return errorResponse(error, "[pickup/gate] POST failed"); }
}
