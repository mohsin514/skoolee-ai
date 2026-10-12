import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, canManageOperations } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { saveManualTimetable, changeManualTimetableStatus, deleteManualTimetable, TimetableValidationError, resolveTimetableCampus } from "@/lib/timetable/manual";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const campusId = await resolveTimetableCampus(user, id);

    const timetable = await prisma.timetable.findFirst({
      where: { id, campusId: campusId || undefined },
      include: {
        class: { select: { id: true, name: true, section: true } },
        slots: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, fullName: true } },
            room: { select: { id: true, roomNumber: true, capacity: true } },
          },
          orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
        },
      },
    });

    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ success: true, data: timetable });
  } catch (error) {
    return errorResponse(error, "[timetable/id] GET failed");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const campusId = await resolveTimetableCampus(user, id);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });
    const body = await req.json();
    if (body.action === "publish" || body.action === "unpublish") {
      const result = await changeManualTimetableStatus(user, campusId, id, body.action);
      // Notifications are outside the retry boundary and only follow an actual
      // committed status transition; repeated publish requests do not resend.
      if (body.action === "publish" && result.changed) notify("TIMETABLE_PUBLISHED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, className: result.data.class.name });
      return Response.json({ success: true, data: result.data, ...(result.validation ? { validation: result.validation } : {}) });
    }
    if (Array.isArray(body.slots)) return Response.json({ success: true, ...await saveManualTimetable(user, campusId, id, body.slots) });
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    if (error instanceof TimetableValidationError) return Response.json({ error: error.message, validation: error.validation, conflicts: error.validation.conflicts.filter(item => item.severity === "CRITICAL").map(item => item.message) }, { status: 409 });
    return errorResponse(error, "[timetable/id] PUT failed");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const campusId = await resolveTimetableCampus(user, id);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });
    const deleted = await deleteManualTimetable(user, campusId, id);
    notify("TIMETABLE_DELETED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, className: deleted.class.name });
    return Response.json({ success: true });
  } catch (error) { return errorResponse(error, "[timetable/id] DELETE failed"); }
}
