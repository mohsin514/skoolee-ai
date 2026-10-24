import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageAcademics,
  canManageCampusOps,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { runNotificationAutomationSweep } from "@/lib/notifications/automation";
import { announcementHistoryRestriction } from "@/lib/school-ai/announcement-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const automationSchema = z.object({
  action: z.literal("run-automation"),
  trigger: z.string().optional(),
  campusId: z.string().optional(),
});

/** What the academic lead may read: report and exam delivery to families ("Report delivery", §2.2 #44).
 *  Fee reminders, announcements and inbound chats stay with campus operations. */
const ACADEMIC_DELIVERY_SCOPE = {
  OR: [
    { templateKey: { in: ["REPORT_CARD_PUBLISHED", "REPORT_CARD_GENERATED", "EXAM_SCHEDULE", "MARKS_ENTRY_DEADLINE_NEAR"] } },
    { relatedType: { in: ["REPORT_CARD", "EXAM"] } },
  ],
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageAcademics(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    // Campus operations see the whole family-communication log; everyone else (the principal) only the
    // academic delivery log. `scope=academic` lets an operator ask for the narrow view too.
    const academicOnly = !canManageCampusOps(user) || searchParams.get("scope") === "academic";
    const status = searchParams.get("status");
    const channel = searchParams.get("channel");
    const studentId = searchParams.get("studentId");
    const parentUserId = searchParams.get("parentUserId");
    const campusId = user.role === "SUPER_ADMIN" ? searchParams.get("campusId") : user.campusId;
    // Announcement bodies, recipients and guardian proofs retain their live
    // permission boundary when shown through the older communication history.
    const historyScope = {
      schoolId: user.schoolId,
      ...(campusId ? { campusId } : {}),
      // AND, not a spread: both the announcement boundary and the academic scope are OR clauses.
      AND: [await announcementHistoryRestriction(user), ...(academicOnly ? [ACADEMIC_DELIVERY_SCOPE] : [])],
    };

    const communications = await prisma.parentCommunication.findMany({
      where: {
        ...historyScope,
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
      where: historyScope,
      _count: { _all: true },
    });

    return Response.json({
      success: true,
      scope: academicOnly ? "academic" : "office",
      communications,
      summary: summary.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count._all;
        return acc;
      }, {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[communications] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // The manual reminder run (fees, marks deadlines, report notices) is a campus-operations act (M46).
    if (!canManageCampusOps(user)) throw new ApiError("Reminders are run by your campus admin.", 403);

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
