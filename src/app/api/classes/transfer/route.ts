import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { ApiError, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { applyEnrollment, assertRegistrar, dateOnly, enrollmentImpact } from "@/lib/students/enrollment";
import { authorizeAssignment } from "@/lib/api/teacher-assignments";

// SKO-462: the safe transition for an occupied section. Every enrolled pupil moves to another
// section of the same campus and year through the reviewed enrollment transition (history,
// attendance, reports and invoices stay with the enrollment they belong to), all or nothing, and
// the emptied section can then be archived. A retry after success finds nobody left to move.

type Blocked = { studentId: string; name: string; reason: string };

async function plan(fromClassId: string, toClassId: string, effectiveDate: Date, campusScope: string | null) {
  if (!fromClassId || !toClassId) throw new ApiError("Choose the section to move from and to.", 400);
  if (fromClassId === toClassId) throw new ApiError("Choose a different section to move the students to.", 400);
  const [from, to] = await Promise.all([
    prisma.class.findFirst({ where: { id: fromClassId, ...(campusScope ? { campusId: campusScope } : {}) }, select: { id: true, name: true, section: true, campusId: true, academicYear: true, archivedAt: true } }),
    prisma.class.findFirst({ where: { id: toClassId, ...(campusScope ? { campusId: campusScope } : {}) }, select: { id: true, name: true, section: true, campusId: true, academicYear: true, archivedAt: true, status: true } }),
  ]);
  if (!from || !to) throw new ApiError("Section not found", 404);
  if (to.archivedAt || to.status !== "ACTIVE") throw new ApiError("Students can only move to an active section.", 409);
  if (from.campusId !== to.campusId || from.academicYear !== to.academicYear) throw new ApiError("Move students to a section of the same campus and academic year; use promotion for a new year.", 409);
  const students = await prisma.student.findMany({ where: { classId: from.id, archivedAt: null, status: "active" }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } });
  const ready: Array<{ id: string; fullName: string; rollNo: string; enrollmentId: string; preserved: { attendance: number; reports: number; invoices: number } }> = [];
  const blocked: Blocked[] = [];
  for (const student of students) {
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { studentId: student.id, endDate: null, status: "ACTIVE" }, select: { id: true } });
    if (!enrollment) { blocked.push({ studentId: student.id, name: student.fullName, reason: "Current placement needs reconciliation" }); continue; }
    try {
      const impact = await enrollmentImpact(prisma, student.id, enrollment.id, to.id, effectiveDate);
      ready.push({ id: student.id, fullName: student.fullName, rollNo: student.rollNo, enrollmentId: enrollment.id, preserved: impact.preserved });
    } catch (error) {
      blocked.push({ studentId: student.id, name: student.fullName, reason: error instanceof Error ? error.message : "Unavailable" });
    }
  }
  const targetOccupancy = await prisma.student.count({ where: { classId: to.id, archivedAt: null, status: "active" } });
  return { from, to, ready, blocked, targetOccupancy };
}

const label = (cls: { name: string; section: string | null }) => `${cls.name}${cls.section ? ` ${cls.section}` : ""}`;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    await assertRegistrar(user);
    const body = await req.json().catch(() => ({}));
    const effectiveDate = dateOnly(body.effectiveDate);
    const campusScope = user.role === "SUPER_ADMIN" ? null : user.campusId ?? "";
    const archiveAfter = body.archiveAfter === true;
    if (archiveAfter) await authorizeAssignment(prisma, user, "students", "delete");
    const preview = await plan(String(body.fromClassId ?? ""), String(body.toClassId ?? ""), effectiveDate, campusScope);
    const summary = {
      from: { id: preview.from.id, label: label(preview.from) }, to: { id: preview.to.id, label: label(preview.to) },
      students: preview.ready.length + preview.blocked.length, ready: preview.ready.length, blocked: preview.blocked, targetOccupancy: preview.targetOccupancy,
      preserved: preview.ready.reduce((sum, row) => ({ attendance: sum.attendance + row.preserved.attendance, reports: sum.reports + row.preserved.reports, invoices: sum.invoices + row.preserved.invoices }), { attendance: 0, reports: 0, invoices: 0 }),
    };
    if (body.action !== "apply") return Response.json({ success: true, preview: summary });
    // All or nothing: a section is never left half-moved.
    if (preview.blocked.length) throw new ApiError(`${preview.blocked.length} student(s) cannot move on this date. Resolve them first; nobody was moved.`, 409);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : `Section transfer to ${label(preview.to)}`;
    const apply = () => prisma.$transaction(async tx => {
      // Serialise transfers out of this section; a concurrent retry waits and then finds it empty.
      await tx.$queryRaw`SELECT id FROM classes WHERE id = ${preview.from.id} FOR UPDATE`;
      const remaining = await tx.student.findMany({ where: { classId: preview.from.id, archivedAt: null, status: "active" }, select: { id: true } });
      let moved = 0;
      for (const student of remaining) {
        const row = preview.ready.find(entry => entry.id === student.id);
        if (!row) throw new ApiError("The section changed while you were reviewing it. Preview again.", 409);
        // Roll numbers are unique per campus, and the move stays in the campus, so each pupil keeps theirs.
        await applyEnrollment(tx, { studentId: row.id, fromId: row.enrollmentId, targetClassId: preview.to.id, effectiveDate, rollNo: row.rollNo, actorId: user.userId, reason });
        moved++;
      }
      let archived = false;
      if (archiveAfter) {
        const cls = await tx.class.findUniqueOrThrow({ where: { id: preview.from.id }, select: { archivedAt: true, status: true } });
        if (!cls.archivedAt) {
          // The same archive the class DELETE performs: history kept, status COMPLETED, restorable.
          await tx.class.update({ where: { id: preview.from.id }, data: { archivedAt: new Date(), archiveReason: reason, archivePreviousStatus: cls.status, status: "COMPLETED" } });
          archived = true;
        }
      }
      await tx.auditLog.create({ data: { schoolId: user.schoolId, userId: user.userId, tableName: "class", recordId: preview.from.id, newValue: { action: "section.transfer", toClassId: preview.to.id, moved, archived, effectiveDate: effectiveDate.toISOString().slice(0, 10) } } });
      return { moved, archived };
    }, { isolationLevel: "Serializable", timeout: 60_000 });
    let result;
    for (let attempt = 1; ; attempt++) {
      try { result = await apply(); break; }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 3) throw error;
      }
    }
    return Response.json({ success: true, ...result, preview: summary });
  } catch (error) {
    return errorResponse(error, "[classes/transfer] failed");
  }
}
