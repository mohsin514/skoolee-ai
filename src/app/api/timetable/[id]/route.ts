import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, canLeadAcademics, canManageOperations } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { saveManualTimetable, changeManualTimetableStatus, deleteManualTimetable, TimetableValidationError, resolveTimetableCampus, previewTimetablePublish, publishTimetableVersion } from "@/lib/timetable/manual";
import { notifyTimetableVersion } from "@/lib/timetable/notify";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const campusId = await resolveTimetableCampus(user, id);
    // SKO-403: what publishing this draft would do (conflicts, changed lessons, who is told).
    if (_req.nextUrl.searchParams.get("publication")) return Response.json({ success: true, data: await previewTimetablePublish(user, campusId, id) });

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
    const body = await parseBody(req, jsonObjectBody);
    // G35a: publishing or unpublishing a timetable is the academic lead's act — the principal, or a campus
    // operator only while the campus has no principal. Drafts stay open to the academic office.
    if ((body.action === "publish" || body.action === "unpublish") && !(await canLeadAcademics(user, campusId))) {
      return Response.json({ error: "Your principal publishes the timetable." }, { status: 403 });
    }
    if (body.action === "publish") {
      // SKO-403: a reviewed publication of an exact draft revision, effective from a chosen date.
      const result = await publishTimetableVersion(user, campusId, id, body);
      notify("TIMETABLE_PUBLISHED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, className: result.data.class.name, classId: result.data.class.id });
      const delivery = await notifyTimetableVersion(user, id, result.version.id).catch(error => { console.error("[timetable] change notice failed", error); return { sent: false }; });
      return Response.json({ success: true, data: result.data, version: { id: result.version.id, version: result.version.version, effectiveFrom: result.version.effectiveFrom.toISOString().slice(0, 10) }, changes: result.changes.length, delivery });
    }
    if (body.action === "notify" && typeof body.versionId === "string") return Response.json({ success: true, delivery: await notifyTimetableVersion(user, id, body.versionId) });
    if (body.action === "unpublish") {
      const result = await changeManualTimetableStatus(user, campusId, id, body.action);
      // SKAI-1129: unpublishing sends no notice. The publish notice (with classId) fires in the publish branch above;
      // there is no unpublish event, so the former publish-only notify here was unreachable and is removed.
      return Response.json({ success: true, data: result.data, ...(result.validation ? { validation: result.validation } : {}) });
    }
    if (Array.isArray(body.slots)) return Response.json({ success: true, ...await saveManualTimetable(user, campusId, id, body.slots, typeof body.draftRevision === "number" ? body.draftRevision : undefined) });
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
