import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { act, complaintCursor, complaintPageWhere, intake, isLeader, overdue, visibleWhere } from "@/lib/front-desk/complaints";
import { ownerCandidates } from "@/lib/front-desk/phone-calls";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  canManageFrontDesk,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { fail, failFrom, ok, okWith } from "@/lib/api/envelope";
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
      return ok(owners);
    }

    const id = params.get("id");
    if (id) {
      const complaint = await prisma.complaint.findFirst({ where: { id, ...scope, AND: [visibleWhere(user)] }, include: { owner: ownerSelect, events: { orderBy: { createdAt: "asc" } } } });
      if (!complaint) throw new ApiError("Complaint not found", 404);
      const actorIds = [...new Set(complaint.events.flatMap(event => [event.actorId, event.ownerId]).filter((value): value is string => Boolean(value)))];
      const people = new Map((await prisma.user.findMany({ where: { id: { in: actorIds }, schoolId: user.schoolId }, select: { id: true, fullName: true } })).map(person => [person.id, person.fullName]));
      const { requestHash: _hash, idempotencyKey: _key, ...rest } = complaint;
      return ok({ ...rest, overdue: overdue(complaint, todayUtc()), events: complaint.events.map(event => ({ ...event, actorName: people.get(event.actorId) ?? null, ownerName: event.ownerId ? people.get(event.ownerId) ?? null : null })) });
    }

    const requested = params.get("status");
    if (requested && !["OPEN", "IN_PROGRESS", "RESOLVED", "active", "all"].includes(requested)) throw new ApiError("Unknown status", 400);
    const status = requested === "all" ? null : requested;
    const owner = params.get("owner");
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const today = todayUtc();
    const filters = {
      ...scope, AND: [visibleWhere(user)] as Prisma.ComplaintWhereInput[],
      ...(status === "active" ? { status: { not: "RESOLVED" } } : status ? { status } : {}),
      ...(owner === "me" ? { ownerId: user.userId } : owner === "unassigned" ? { ownerId: null } : {}),
      ...(params.get("overdue") ? { status: { not: "RESOLVED" }, dueDate: { lt: today } } : {}),
      ...(q ? { OR: [{ referenceCode: { contains: q, mode: "insensitive" as const } }, { type: { contains: q, mode: "insensitive" as const } }, { complainantName: { contains: q, mode: "insensitive" as const } }] } : {}),
    } satisfies Prisma.ComplaintWhereInput;
    // SKAI-1720: the queue pages by keyset; the counters count the whole filtered queue, not the loaded page.
    const page = complaintPageWhere(params.get("cursor"));
    const rows = await prisma.complaint.findMany({
      where: page ? { ...filters, AND: [...filters.AND, page] } : filters,
      select: { id: true, referenceCode: true, type: true, complainantName: true, confidential: true, status: true, date: true, dueDate: true, reopenedCount: true, version: true, owner: ownerSelect, createdAt: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      // SKAI-1675: one past the cap tells the client the list (and so its export) is not complete.
      take: 301,
    });
    const truncated = rows.length > 300;
    rows.splice(300);
    const last = rows[rows.length - 1];
    const activeWhere = { ...filters, AND: [...filters.AND, { status: { not: "RESOLVED" } }] };
    const [active, unassigned, late] = await Promise.all([
      prisma.complaint.count({ where: activeWhere }),
      prisma.complaint.count({ where: { ...activeWhere, AND: [...activeWhere.AND, { ownerId: null }] } }),
      prisma.complaint.count({ where: { ...activeWhere, AND: [...activeWhere.AND, { dueDate: { lt: today } }] } }),
    ]);
    return okWith(rows.map(row => ({ ...row, overdue: overdue(row, today) })), {
      counts: { active, unassigned, overdue: late },
      canSeeConfidential: isLeader(user),
      truncated,
      nextCursor: truncated && last ? complaintCursor(last) : null,
    });
  } catch (error) {
    return failFrom(error, "[front-desk] complaints GET failed");
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
    return okWith(visible ? rest : { referenceCode: complaint.referenceCode, confidential: true }, { replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return failFrom(error, "[front-desk] complaints POST failed");
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
    return ok(data);
  } catch (error) {
    return failFrom(error, "[front-desk] complaints PATCH failed");
  }
}

export async function DELETE() {
  return fail("BAD_REQUEST", "Complaints and their history are kept. Resolve the complaint with a reason instead.", undefined, 405);
}
