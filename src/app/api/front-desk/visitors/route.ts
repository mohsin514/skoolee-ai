import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { csvCell } from "@/lib/csv";
import { checkIn, checkOut, correctVisit, OVERDUE_HOURS } from "@/lib/front-desk/visitors";
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

// SKO-466 visitor register.
// GET   ?campusId=&status=ON_SITE|LEFT|REFUSED|all&q=&date=YYYY-MM-DD[&format=csv] → campus-scoped list with
//       on-site and overdue counts. Phone numbers are shown only to front-desk staff who can edit.
// POST  {action: "check-in"|"refuse", name, purpose, toMeet, phone?, reference?, inTime?, idempotencyKey}
// PATCH {id, action: "check-out", outTime?} | {id, action: "correct", changes, reason, version}
// DELETE is not supported: visits are corrected with a reason, never erased.

const OVERDUE_MS = OVERDUE_HOURS * 3_600_000;
const mask = (phone: string | null) => (phone ? `•••${phone.replace(/\D/g, "").slice(-3)}` : null);
const visibleFields = <T extends { requestHash?: unknown; idempotencyKey?: unknown }>({ requestHash: _hash, idempotencyKey: _key, ...visit }: T) => visit;

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertModuleRead(user, "front-desk");
    const params = request.nextUrl.searchParams;
    const campusId = await resolveCampusId(user, params.get("campusId"));
    const status = params.get("status") || "all";
    if (!["all", "ON_SITE", "LEFT", "REFUSED"].includes(status)) throw new ApiError("Unknown status", 400);
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const date = params.get("date");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("Dates must be YYYY-MM-DD", 400);
    const where = {
      campusId, schoolId: user.schoolId,
      ...(status !== "all" ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { toMeet: { contains: q, mode: "insensitive" as const } }, { reference: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(date ? { inTime: { gte: new Date(`${date}T00:00:00.000Z`), lte: new Date(`${date}T23:59:59.999Z`) } } : {}),
    };
    const seePhone = canManageFrontDesk(user);
    const now = Date.now();
    const [rows, onSite] = await Promise.all([
      prisma.visitorLog.findMany({ where, orderBy: [{ inTime: "desc" }], take: params.get("format") === "csv" ? 5000 : 300 }),
      prisma.visitorLog.findMany({ where: { campusId, schoolId: user.schoolId, status: "ON_SITE" }, select: { inTime: true } }),
    ]);
    const data = rows.map(row => ({ ...visibleFields(row), phone: seePhone ? row.phone : mask(row.phone), overdue: row.status === "ON_SITE" && now - row.inTime.getTime() > OVERDUE_MS }));

    if (params.get("format") === "csv") {
      const lines = [["Name", "Reference", "Purpose", "Host", "Status", "Arrived", "Left", "Phone"].join(",")];
      for (const row of data) lines.push([row.name, row.reference ?? "", row.purpose ?? "", row.toMeet ?? "", row.status, row.inTime.toISOString(), row.outTime?.toISOString() ?? "", row.phone ?? ""].map(csvCell).join(","));
      return new Response("﻿" + lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="visitors-${date || "all"}.csv"`, "Cache-Control": "no-store" } });
    }
    return Response.json({ success: true, data, onSite: onSite.length, overdue: onSite.filter(row => now - row.inTime.getTime() > OVERDUE_MS).length, overdueHours: OVERDUE_HOURS });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors GET failed");
  }
}

function conflict(error: unknown) {
  if (error instanceof ApiError && "duplicates" in error) return Response.json({ error: error.message, duplicates: (error as ApiError & { duplicates: unknown }).duplicates }, { status: error.status });
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can record visitors.", 403);
    await assertPermission(user, "front-desk", "add");
    const body = await parseBody(request, jsonObjectBody);
    if (body.action && body.action !== "check-in" && body.action !== "refuse") throw new ApiError("Unknown action", 400);
    const campusId = await resolveCampusId(user, body.campusId);
    const { visit, replayed } = await checkIn(user, campusId, body);
    return Response.json({ success: true, data: visibleFields(visit), replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    return conflict(error) ?? errorResponse(error, "[front-desk] visitors POST failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageFrontDesk(user)) throw new ApiError("Only front-desk staff and campus leaders can update visitors.", 403);
    await assertPermission(user, "front-desk", "edit");
    const body = await parseBody(request, idBody);
    const campusId = await resolveCampusId(user, body.campusId);
    // The old client sent {id, outTime} without an action; treat it as a check-out.
    const action = body.action ?? (body.outTime !== undefined ? "check-out" : null);
    const result = action === "check-out" ? await checkOut(user, campusId, String(body.id), body.outTime)
      : action === "correct" ? await correctVisit(user, campusId, body)
      : null;
    if (!result) throw new ApiError("Unknown action", 400);
    return Response.json({ success: true, data: visibleFields(result.visit), replayed: result.replayed });
  } catch (error) {
    return errorResponse(error, "[front-desk] visitors PATCH failed");
  }
}

export async function DELETE() {
  return Response.json({ error: "Visitor records are kept for safeguarding. Correct the record with a reason instead." }, { status: 405 });
}
