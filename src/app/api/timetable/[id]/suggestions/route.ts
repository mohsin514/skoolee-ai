import { NextRequest } from "next/server";
import { canManageOperations, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { applySuggestion, buildSuggestions, type SuggestionAction } from "@/lib/timetable/suggest";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

// Conflict resolution for one class timetable (§67–69).
//
// GET  /api/timetable/<id>/suggestions        → conflicts + proposed fixes
// POST /api/timetable/<id>/suggestions { action } → apply one, then re-validate
//
// Both are restricted to staff who can manage operations: a suggestion names
// which teacher is free when, which is the same staff data every other roster
// route keeps away from families.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const campusId = await resolveCampusId(user);

    // Answer 404 for a timetable outside this campus. buildSuggestions() is
    // already campus-scoped and returns an empty report, so nothing leaked —
    // but a 200 on someone else's id is still the wrong answer, and 404 is
    // indistinguishable from "no such timetable", so it is no existence oracle.
    const timetable = await prisma.timetable.findFirst({
      where: { id, campusId },
      select: { id: true },
    });
    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ success: true, data: await buildSuggestions(campusId, id) });
  } catch (error) {
    return errorResponse(error, "[timetable/suggestions] GET failed");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const campusId = await resolveCampusId(user);
    const body = await req.json();
    const action = body?.action as SuggestionAction | undefined;
    if (!action?.type || !action?.slotId) {
      return Response.json({ error: "action { type, slotId } is required" }, { status: 400 });
    }

    const result = await applySuggestion({ campusId, timetableId: id, action });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error, "[timetable/suggestions] POST failed");
  }
}
