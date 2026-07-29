import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, resolveCampusId, canManageOperations } from "@/lib/api/scope";

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
    const campusId = await resolveCampusId(user);
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const body = await req.json();
    const { slots, action } = body;

    const timetable = await prisma.timetable.findFirst({
      where: { id, campusId },
    });
    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });

    if (action === "publish") {
      const updated = await prisma.timetable.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
        include: {
          class: { select: { id: true, name: true, section: true } },
          slots: {
            include: {
              subject: { select: { id: true, name: true } },
              teacher: { select: { id: true, fullName: true } },
            },
            orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
          },
        },
      });
      return Response.json({ success: true, data: updated });
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
            },
            orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
          },
        },
      });
      return Response.json({ success: true, data: updated });
    }

    if (Array.isArray(slots)) {
      const conflicts: string[] = [];
      for (const slot of slots) {
        if (!slot.subjectId || !slot.teacherId) continue;

        const conflict = await prisma.timetableSlot.findFirst({
          where: {
            timetable: { campusId, id: { not: id } },
            teacherId: slot.teacherId,
            dayOfWeek: slot.dayOfWeek,
            periodNumber: slot.periodNumber,
          },
          include: {
            timetable: { include: { class: { select: { name: true, section: true } } } },
            teacher: { select: { fullName: true } },
          },
        });

        if (conflict) {
          const cls = conflict.timetable.class;
          conflicts.push(
            `${conflict.teacher?.fullName} is already assigned to ${cls.name}${cls.section ? ` - ${cls.section}` : ""} on this slot`
          );
        }
      }

      if (conflicts.length > 0) {
        return Response.json({ error: "Teacher conflicts detected", conflicts }, { status: 409 });
      }

      await prisma.$transaction(
        slots.map((slot: any) =>
          prisma.timetableSlot.update({
            where: { id: slot.id },
            data: {
              subjectId: slot.subjectId || null,
              teacherId: slot.teacherId || null,
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
            },
            orderBy: [{ dayOfWeek: "asc" }, { periodNumber: "asc" }],
          },
        },
      });

      return Response.json({ success: true, data: updated });
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

    const timetable = await prisma.timetable.findFirst({ where: { id, campusId } });
    if (!timetable) return Response.json({ error: "Not found" }, { status: 404 });

    await prisma.timetable.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[timetable/id] DELETE failed");
  }
}
