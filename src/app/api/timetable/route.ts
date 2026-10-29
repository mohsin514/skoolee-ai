import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuthUser, errorResponse, resolveCampusId, canManageOperations,
  assertSharedModuleRead,
} from "@/lib/api/scope";
import { createManualTimetable, resolveTimetableCreateCampus } from "@/lib/timetable/manual";
import { notify } from "@/lib/notifications/in-app";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertSharedModuleRead(user, "timetable");
    const campusId = await resolveCampusId(user, req.nextUrl.searchParams.get("campusId"));
    if (!campusId) return Response.json({ error: "No campus" }, { status: 400 });

    const classId = req.nextUrl.searchParams.get("classId");
    const academicYear = req.nextUrl.searchParams.get("academicYear");

    const where: any = { campusId };
    if (classId) where.classId = classId;
    if (academicYear) where.academicYear = parseInt(academicYear);

    const timetables = await prisma.timetable.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ success: true, data: timetables });
  } catch (error) {
    return errorResponse(error, "[timetable] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
    const body = await parseBody(req, jsonObjectBody);
    const campusId = await resolveTimetableCreateCampus(user, body);
    const timetable = await createManualTimetable(user, campusId, body);
    notify("TIMETABLE_CREATED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, className: timetable.class.name });
    return Response.json({ success: true, data: timetable }, { status: 201 });
  } catch (error) { return errorResponse(error, "[timetable] POST failed"); }
}
