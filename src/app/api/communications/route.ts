import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { runNotificationAutomationSweep } from "@/lib/notifications/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const automationSchema = z.object({
  action: z.literal("run-automation"),
  trigger: z.string().optional(),
  campusId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const studentId = searchParams.get("studentId");
    const parentUserId = searchParams.get("parentUserId");
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;

    const communications = await prisma.parentCommunication.findMany({
      where: {
        schoolId: user.schoolId,
        ...(campusId ? { campusId } : {}),
        ...(status && status !== "ALL" ? { status } : {}),
        ...(channel && channel !== "ALL" ? { channel } : {}),
        ...(studentId ? { studentId } : {}),
        ...(parentUserId ? { parentUserId } : {}),
      },
      include: {
        student: {
          select: {
            fullName: true,
            rollNo: true,
            class: { select: { name: true, section: true } },
          },
        },
        parent: { select: { fullName: true, email: true, phone: true } },
        campus: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const summary = await prisma.parentCommunication.groupBy({
      by: ["status"],
      where: {
        schoolId: user.schoolId,
        ...(campusId ? { campusId } : {}),
      },
      _count: { _all: true },
    });

    return Response.json({
      success: true,
      communications,
      summary: summary.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count._all;
        return acc;
      }, {}),
    });
  } catch (error) {
    return errorResponse(error, "[communications] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = automationSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const campusId = user.role === "SUPER_ADMIN" ? parsed.data.campusId : user.campusId;
    const results = await runNotificationAutomationSweep({
      schoolId: user.schoolId,
      campusId,
      trigger: parsed.data.trigger,
    });

    return Response.json({ success: true, processed: results.length });
  } catch (error) {
    return errorResponse(error, "[communications] POST failed");
  }
}
