import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { notify } from "@/lib/notifications/in-app";

/**
 * Send a locked exam's marks back to the teacher.
 *
 * Locking was previously one-way: once a principal locked an exam there was no
 * status and no route that could return it, so a single mistyped mark could
 * only be fixed in the database. This is the missing half of the review
 * workflow — the reject arm of approve/reject.
 *
 * Rejecting must also withdraw the report cards that locking generated.
 * Leaving them in place would keep wrong results in front of families while the
 * teacher corrects the marks, which is the exact failure the review step exists
 * to prevent.
 */

function canReviewExam(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

/** Statuses a rejection can act on — anything past marks entry, but not released. */
const REVIEWABLE = ["LOCKED", "PRINCIPAL_REVIEWED"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;

    if (!canReviewExam(user.role)) {
      return Response.json(
        { error: "Only admins and principals can send marks back" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = String(body?.reason ?? "").trim();

    // A rejection without a reason is just an unexplained reversal; the teacher
    // has to know what to change.
    if (reason.length < 5) {
      return Response.json(
        { error: "Give a reason (at least 5 characters) so the teacher knows what to correct" },
        { status: 400 }
      );
    }
    if (reason.length > 2000) {
      return Response.json({ error: "Reason is too long (max 2000 characters)" }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        campusId: true,
        classId: true,
        rejectionCount: true,
        class: { select: { name: true, section: true } },
      },
    });

    if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
    if (user.campusId && exam.campusId !== user.campusId) {
      return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
    }

    if (exam.status === "PUBLISHED") {
      return Response.json(
        { error: "Results are already published. Unpublish the exam before sending marks back." },
        { status: 409 }
      );
    }
    if (!REVIEWABLE.includes(exam.status)) {
      return Response.json(
        { error: `Only locked exams can be sent back (this one is ${exam.status})` },
        { status: 409 }
      );
    }

    // Report cards and the unlock have to move together — a half-applied
    // rejection would leave stale cards attached to editable marks.
    const [, updated] = await prisma.$transaction([
      prisma.reportCard.deleteMany({ where: { examId: id } }),
      prisma.exam.update({
        where: { id },
        data: {
          status: "MARKS_ENTRY",
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: reason,
          rejectedBy: user.userId,
          rejectedAt: new Date(),
          rejectionCount: { increment: 1 },
        },
        include: {
          class: { select: { id: true, name: true, section: true, academicYear: true } },
          _count: { select: { marks: true, reportCards: true } },
        },
      }),
    ]);

    notify("MARKS_REJECTED", {
      schoolId: user.schoolId,
      campusId: exam.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      examTitle: exam.title,
      className: [exam.class?.name, exam.class?.section].filter(Boolean).join(" "),
      classId: exam.classId,
      reason,
    });

    return Response.json({ success: true, exam: updated });
  } catch (error) {
    console.error("[exams/[id]/reject] POST failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
