import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, requireAuthUser, errorResponse, resolveCampusId, canManageOperations } from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import { validateStoredTimetable, validateTimetableSlots } from "@/lib/timetable/validate";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    const { id } = await params;
    const campusId = await resolveCampusId(user);

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

/**
 * Referential integrity for a slot save.
 *
 * Rejects, with a message naming the actual problem:
 *  - a slot id that belongs to a different timetable
 *  - a teacher who is inactive, off-campus, or not a teacher at all
 *  - a room from another campus
 *  - a subject that belongs to a different class
 *
 * Deliberately one batched query per reference type rather than per slot —
 * a full week is ~48 slots and this runs on every save.
 */
async function assertSlotReferences(opts: {
  campusId: string;
  timetableId: string;
  classId: string;
  slots: any[];
}) {
  const { campusId, timetableId, classId, slots } = opts;
  const bad = (message: string) => {
    throw new ApiError(message, 400);
  };

  const slotIds = [...new Set(slots.map((s) => s?.id).filter(Boolean))] as string[];
  if (slotIds.length !== slots.length) bad("Every slot must carry its id");

  const owned = await prisma.timetableSlot.count({
    where: { id: { in: slotIds }, timetableId },
  });
  if (owned !== slotIds.length) bad("One or more slots do not belong to this timetable");

  const ids = (key: string) =>
    [...new Set(slots.map((s) => s?.[key]).filter(Boolean))] as string[];

  const teacherIds = ids("teacherId");
  if (teacherIds.length) {
    const found = await prisma.user.findMany({
      where: {
        id: { in: teacherIds },
        campusId,
        role: { in: ["TEACHER", "PRINCIPAL"] },
        isActive: true,
      },
      select: { id: true },
    });
    if (found.length !== teacherIds.length) {
      bad("One or more teachers are not active in this campus");
    }
  }

  const roomIds = ids("roomId");
  if (roomIds.length) {
    const found = await prisma.classRoom.count({ where: { id: { in: roomIds }, campusId } });
    if (found !== roomIds.length) bad("One or more rooms do not belong to this campus");
  }

  const subjectIds = ids("subjectId");
  if (subjectIds.length) {
    const found = await prisma.subject.count({ where: { id: { in: subjectIds }, classId } });
    if (found !== subjectIds.length) bad("One or more subjects do not belong to this class");
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const body = await req.json();
    const { slots, action } = body;

    const timetable = await prisma.timetable.findFirst({
      where: { id, campusId },
    });
    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });

    if (action === "publish") {
      // Publishing pushes the board to every teacher, student and parent, so it
      // is the last point at which a clash can still be caught cheaply.
      const validation = await validateStoredTimetable(id, campusId);
      if (!validation.canPublish) {
        return Response.json(
          {
            error: `Cannot publish: ${validation.counts.critical} unresolved conflict${validation.counts.critical === 1 ? "" : "s"}. Resolve them and try again.`,
            validation,
          },
          { status: 409 }
        );
      }

      const updated = await prisma.timetable.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
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
      notify("TIMETABLE_PUBLISHED", {
        schoolId: user.schoolId,
        campusId,
        actorId: user.userId,
        actorName: user.fullName,
        className: updated.class?.name,
      });
      return Response.json({ success: true, data: updated, validation });
    }

    if (action === "unpublish") {
      const updated = await prisma.timetable.update({
        where: { id },
        data: { status: "DRAFT", publishedAt: null },
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
      return Response.json({ success: true, data: updated });
    }

    if (Array.isArray(slots)) {
      // Every id in the payload has to be checked before anything is written.
      // The conflict engine answers "is this slot free?" — it never answered
      // "is this slot, teacher, room and subject even mine?", so an id from
      // another class's board, or a teacher who left the school last term,
      // went straight into the update.
      await assertSlotReferences({ campusId, timetableId: id, classId: timetable.classId, slots });

      const validation = await validateTimetableSlots({
        campusId,
        timetableId: id,
        classId: timetable.classId,
        slots: slots as any[],
      });

      // Only hard clashes block a save — an admin must be able to park a
      // half-built draft. Warnings ride along so the board can show them.
      if (!validation.canPublish) {
        return Response.json(
          {
            error: validation.conflicts.find((c) => c.severity === "CRITICAL")?.message ?? "Scheduling conflict",
            conflicts: validation.conflicts.filter((c) => c.severity === "CRITICAL").map((c) => c.message),
            validation,
          },
          { status: 409 }
        );
      }

      await prisma.$transaction(
        slots.map((slot: any) =>
          prisma.timetableSlot.update({
            where: { id: slot.id },
            data: {
              subjectId: slot.subjectId || null,
              teacherId: slot.teacherId || null,
              roomId: slot.roomId || null,
              roomNumber: slot.roomNumber || null,
              slotType: slot.slotType || "CLASS",
              startTime: slot.startTime,
              endTime: slot.endTime,
            },
          })
        )
      );

      const updated = await prisma.timetable.findUnique({
        where: { id },
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

      return Response.json({ success: true, data: updated, validation });
    }

    return Response.json({ error: "Invalid request body" }, { status: 400 });
  } catch (error) {
    return errorResponse(error, "[timetable/id] PUT failed");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const timetable = await prisma.timetable.findFirst({
      where: { id, campusId },
      include: { class: { select: { name: true } } },
    });
    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.timetable.delete({ where: { id } });

    notify("TIMETABLE_DELETED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className: timetable.class?.name,
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[timetable/id] DELETE failed");
  }
}
