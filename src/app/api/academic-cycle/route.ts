import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/in-app";
import {
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { writeAcademicCycle } from "@/lib/school-ai/school-operations-cycle-write";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const sp = req.nextUrl.searchParams;

    if (!user.campusId && user.role !== "SUPER_ADMIN") {
      return Response.json({ success: true, data: [], active: null });
    }

    const campusId = await resolveCampusId(user, sp.get("campusId"));

    const cycles = await prisma.academicCycle.findMany({
      where: { campusId },
      orderBy: { createdAt: "desc" },
    });

    const active = cycles.find((c) => c.status === "ACTIVE") || null;

    return Response.json({ success: true, data: cycles, active });
  } catch (error) {
    return errorResponse(error, "[academic-cycle] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();
    const campusId = await resolveCampusId(user, body.campusId);
    const cycle = await writeAcademicCycle(user, campusId, body);
    notify("ACADEMIC_CYCLE_CHANGED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, label: cycle.label, status: cycle.status });
    return Response.json({ success: true, data: cycle, message: `Cycle ${cycle.status.toLowerCase()}` });
  } catch (error) { return errorResponse(error, "[academic-cycle] POST failed"); }
}
