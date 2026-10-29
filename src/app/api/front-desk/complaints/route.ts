import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { act, intake, isLeader, overdue, visibleWhere } from "@/lib/front-desk/complaints";
import { ownerCandidates } from "@/lib/front-desk/phone-calls";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageFrontDesk,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { idBody, jsonObjectBody } from "@/lib/validators/route-bodies";

// SKO-467 complaint cases.
// GET   ?campusId=&status=&owner=me|unassigned&overdue=1&q=   → queue (minimum metadata, no narrative)
// GET   ?id=                                                  → case detail with history (404 if not permitted)
// GET   ?owners=1                                             → front-office owners on this campus (campus admins, ADMIN, receptionists; G40)
// POST  {complainantName|anonymous, type, description, date, phone?, confidential?, ownerId?, dueDate?, idempotencyKey}
// PATCH {id, version, action: assign|note|start|resolve|reopen, ...}
// DELETE is not supported: complaints and their history are kept.

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
const ownerSelect = { select: { id: true, fullName: true } } as const;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const scope = { campusId, schoolId: user.schoolId };

    if (params.get("owners")) {
      const owners = await ownerCandidates(user, campusId);
      return Response.json({ success: true, data: owners });
    }

    const id = params.get("id");
    if (id) {
      const complaint = await prisma.complaint.findFirst({ where: { id, ...scope, AND: [visibleWhere(user)] }, include: { owner: ownerSelect, events: { orderBy: { createdAt: "asc" } } } });
      if (!complaint) throw new ApiError("Complaint not found", 404);
      const actorIds = [...new Set(complaint.events.flatMap(event => [event.actorId, event.ownerId]).filter((value): value is string => Boolean(value)))];
      const people = new Map((await prisma.user.findMany({ where: { id: { in: actorIds }, schoolId: user.schoolId }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
      const { requestHash: _hash, idempotencyKey: _key, ...rest } = complaint;
      return Response.json({ success: true, data: { ...rest, overdue: overdue(complaint, todayUtc()), events: complaint.events.map(event => ({ ...event, actorName: people.get(event.actorId) ?? null, ownerName: event.ownerId ? people.get(event.ownerId) ?? null : null })) } });
    }

    const requested = params.get("status");
    if (requested && !["OPEN", "IN_PROGRESS", "RESOLVED", "active", "all"].includes(requested)) throw new ApiError("Unknown status", 400);
    const status = requested === "all" ? null : requested;
    const owner = params.get("owner");
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const today = todayUtc();
    const rows = await prisma.complaint.findMany({
      where: {
        ...scope, AND: [visibleWhere(user)],
        ...(status === "active" ? { status: { not: "RESOLVED" } } : status ? { status } : {}),
        ...(owner === "me" ? { ownerId: user.userId } : owner === "unassigned" ? { ownerId: null } : {}),
        ...(params.get("overdue") ? { status: { not: "RESOLVED" }, dueDate: { lt: today } } : {}),
        ...(q ? { OR: [{ referenceCode: { contains: q, mode: "insensitive" as const } }, { type: { contains: q, mode: "insensitive" as const } }, { complainantName: { contains: q, mode: "insensitive" as const } }] } : {}),
      },
      select: { id: true, referenceCode: true, type: true, complainantName: true, confidential: true, status: true, date: true, dueDate: true, reopenedCount: true, version: true, owner: ownerSelect, createdAt: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
    });
    const active = rows.filter(row => row.status !== "RESOLVED");
    return Response.json({
      success: true,
      data: rows.map(row => ({ ...row, overdue: overdue(row, today) })),
      counts: { active: active.length, unassigned: active.filter(row => !row.owner).length, overdue: active.filter(row => overdue(row, today)).length },
      canSeeConfidential: isLeader(user),
    });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints GET failed");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can record complaints.", 403);
    await assertPermission(user, "front-desk", "add");
    const body = await parseBody(request, jsonObjectBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { complaint, replayed } = await intake(user, campusId, body);
    // Reception gets a receipt for a confidential concern, never a handle to read it back.
    const visible = !complaint.confidential || isLeader(user) || complaint.ownerId === user.userId;
    const { requestHash: _hash, idempotencyKey: _key, ...rest } = complaint;
    return Response.json({ success: true, data: visible ? rest : { referenceCode: complaint.referenceCode, confidential: true }, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    await assertPermission(user, "front-desk", "edit");
    const body = await parseBody(request, idBody);
    const campusId = await resolveCampusId(user, body.campusId);
    const { requestHash: _hash, idempotencyKey: _key, ...data } = await act(user, campusId, body);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[front-desk] complaints PATCH failed");
  }
}

export async function DELETE() {
  return Response.json({ error: "Complaints and their history are kept. Resolve the complaint with a reason instead." }, { status: 405 });
}
