import { NextRequest } from "next/server";
import { act, assertQueueAccess, history, loadQueue } from "@/lib/principal/queue";
import { prisma } from "@/lib/db/prisma";
import { errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";

// SKO-417 principal action queue.
// GET  ?campusId=           → active items (source-derived), counts, resolved history, failed sources, sorting rule
// GET  ?campusId=&staff=1       → campus staff who can be assigned
// GET  ?campusId=&history=  → assignment/acknowledgement/snooze/resolution history for one item key
// POST {campusId, action: assign|acknowledge|snooze|unsnooze, keys[], assigneeId?, until?, reason?} → per-item outcomes

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const campusId = await resolveCampusId(user, request.nextUrl.searchParams.get("campusId"));
    if (request.nextUrl.searchParams.get("staff")) {
      assertQueueAccess(user);
      const staff = await prisma.user.findMany({ where: { schoolId: user.schoolId, isActive: true, role: { notIn: ["PARENT", "STUDENT", "APP_OWNER"] }, OR: [{ campusId }, { role: "SUPER_ADMIN" }] }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" }, take: 300 });
      return Response.json({ success: true, data: staff });
    }
    const key = request.nextUrl.searchParams.get("history");
    if (key) return Response.json({ success: true, data: await history(user, campusId, key) });
    return Response.json({ success: true, data: await loadQueue(user, campusId) });
  } catch (error) {
    return errorResponse(error, "[principal/queue] GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await request.json();
    const campusId = await resolveCampusId(user, body.campusId);
    return Response.json({ success: true, data: await act(user, campusId, body) });
  } catch (error) {
    return errorResponse(error, "[principal/queue] POST failed");
  }
}
