import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertPermission, assertStaffRole, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { MANUAL_TIMELINE_KINDS, TIMELINE_DETAIL_MAX, TIMELINE_TITLE_MAX, readStudentTimeline, scopedTimelineStudent } from "@/lib/students/timeline";

// Student life-cycle timeline (SKAI-166).
// GET  /api/students/timeline?studentId=&cursor=&limit=&kind=
//      — newest-first keyset page, scoped to the reader's school, campus or
//        guardian relationship. Families get life-cycle milestones only, with
//        the withheld count reported as `restrictedCount`.
// POST /api/students/timeline — { studentId, title, detail?, requestId? }
//      — staff note. A retried requestId returns the original event instead of
//        writing a second one.

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const params = req.nextUrl.searchParams;
    const page = await readStudentTimeline(user, params.get("studentId") || "", {
      cursor: params.get("cursor"),
      limit: Number(params.get("limit")) || null,
      kind: params.get("kind"),
    });
    return Response.json({ success: true, data: page }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[students/timeline] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "students", "edit");
    const body = await parseBody(req, jsonObjectBody);
    const kind = String(body.kind ?? "NOTE").toUpperCase();
    // Milestones (admission, promotion, transfer, archive) are written by the
    // workflows that perform them; a hand-typed one would be a false record.
    if (!(MANUAL_TIMELINE_KINDS as readonly string[]).includes(kind)) throw new ApiError("Only notes can be added by hand", 400);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const detail = typeof body.detail === "string" ? body.detail.trim() : "";
    if (!title) throw new ApiError("title is required", 400);
    if (title.length > TIMELINE_TITLE_MAX) throw new ApiError(`title must be ${TIMELINE_TITLE_MAX} characters or fewer`, 400);
    if (detail.length > TIMELINE_DETAIL_MAX) throw new ApiError(`detail must be ${TIMELINE_DETAIL_MAX} characters or fewer`, 400);
    const requestId = typeof body.requestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.requestId) ? body.requestId : null;

    const student = await scopedTimelineStudent(user, String(body.studentId ?? ""));

    if (requestId) {
      // Idempotent retry: the audit row carries the request id of the note it wrote.
      const prior = await prisma.auditLog.findFirst({ where: { schoolId: user.schoolId, tableName: "student_timeline_events", userId: user.userId, newValue: { path: ["requestId"], equals: requestId } }, select: { recordId: true } });
      const existing = prior ? await prisma.studentTimelineEvent.findFirst({ where: { id: prior.recordId, studentId: student.id } }) : null;
      if (existing) return Response.json({ success: true, data: existing, replayed: true });
    }

    // The event and its audit row commit together, so a retry finds either both or neither.
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.studentTimelineEvent.create({
        data: { studentId: student.id, kind, title, detail: detail || null, actorId: user.userId },
      });
      await writeAuditEvent(tx, user, { table: "student_timeline_events", recordId: created.id, action: "CREATE", campusId: student.campusId, after: { studentId: student.id, kind: created.kind, ...(requestId ? { requestId } : {}) } });
      return created;
    }, { maxWait: 10_000, timeout: 60_000 });

    return Response.json({ success: true, data: event, replayed: false }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[students/timeline] POST failed");
  }
}
