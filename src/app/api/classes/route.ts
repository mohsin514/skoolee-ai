import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { classSchema } from "@/lib/validators/schemas";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  assertStaffRole,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { notify } from "@/lib/notifications/in-app";
import {
  detectTeacherClashes,
  syncTimetableSlotsForSubjects,
  type TimetableClash,
} from "@/lib/api/timetable-sync";

async function assertTeacherInCampus(teacherId: string | null | undefined, campusId: string, schoolId: string) {
  if (!teacherId) return null;
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, campusId, schoolId, role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true },
    select: { id: true },
  });
  if (!teacher) throw new ApiError("Teacher is not active in this campus", 400);
  return teacher.id;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Campus-wide structure is staff data. Families see only their own class
    // through the student/parent endpoints.
    assertStaffRole(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    // A teacher's class list drives pickers like "create assessment", so it has
    // to be the classes they actually teach. Campus scope alone offers classes
    // the exam POST will reject with "You are not assigned to this class".
    const teacherScope =
      user.role === "TEACHER"
        ? {
            OR: [
              { classTeacherId: user.userId },
              { subjects: { some: { teacherId: user.userId } } },
            ],
          }
        : {};

    const classes = await prisma.class.findMany({
      where: { ...scopedCampusWhere(user, campusId), ...teacherScope, ...(searchParams.get("includeArchived") === "true" ? {} : { archivedAt: null }) },
      include: {
        campus: { select: { id: true, name: true } },
        classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
        subjects: {
          include: { teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } },
          orderBy: { name: "asc" },
        },
        _count: { select: { students: true, subjects: true } },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }],
    });

    return Response.json({ success: true, data: classes });
  } catch (error) {
    return errorResponse(error, "[classes] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = classSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const campusId = await resolveCampusId(user, body.campusId);
    const rawSections: unknown[] = Array.isArray(body.sections)
      ? body.sections
      : typeof parsed.data.section === "string"
        ? parsed.data.section.split(/[,\n]/)
        : [];
    const normalizedSections = rawSections
      .map((section: unknown) => String(section || "").trim())
      .filter((section: string) => section.length > 0);
    const sections: string[] = Array.from(new Set(normalizedSections));
    const targetSections: Array<string | null> = sections.length ? sections : [null];
    const classTeacherId = await assertTeacherInCampus(
      parsed.data.classTeacherId || parsed.data.teacherId,
      campusId,
      user.schoolId
    );
    const teachingMode = String(body.teachingMode || "SINGLE").toUpperCase() === "SUBJECT" ? "SUBJECT" : "SINGLE";

    const className = parsed.data.name.trim();
    const duplicates = await prisma.class.findMany({
      where: {
        campusId,
        name: className,
        academicYear: parsed.data.academicYear,
        OR: targetSections.map((section) => ({ section })),
      },
      select: { name: true, section: true },
    });
    if (duplicates.length) {
      const label = duplicates.map((item) => `${item.name}${item.section ? ` ${item.section}` : ""}`).join(", ");
      throw new ApiError(`${label} already exists`, 409);
    }

    const classes = await prisma.$transaction(
      targetSections.map((section) =>
        prisma.class.create({
          data: {
            campusId,
            name: className,
            section,
            academicYear: parsed.data.academicYear,
            classTeacherId,
            teachingMode,
          },
          include: {
            classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
            subjects: {
              include: { teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } },
              orderBy: { name: "asc" },
            },
            _count: { select: { students: true, subjects: true } },
          },
        })
      )
    );

    notify("CLASS_CREATED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className,
      section: sections.length ? sections.join(",") : undefined,
      classId: classes[0]?.id,
    });

    // One insert for all sections — this used to be a sequential round-trip per
    // section, which is most of the wall-clock time when the database is remote.
    await prisma.auditLog.createMany({
      data: classes.map((cls) => ({
        tableName: 'class',
        recordId: cls.id,
        newValue: { name: cls.name, section: cls.section, academicYear: cls.academicYear },
        userId: user.userId,
      })),
    });

    return Response.json(
      { success: true, data: classes.length === 1 ? classes[0] : classes, count: classes.length },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[classes] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const { id } = body;
    if (!id) throw new ApiError("Class id is required", 400);

    if (body.action === "restore") {
      const archived = await prisma.class.findFirst({
        where: { id, archivedAt: { not: null }, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
        select: { id: true, campusId: true, name: true, section: true, academicYear: true, archivePreviousStatus: true },
      });
      if (!archived) throw new ApiError("Archived class not found", 404);
      const [campus, conflict] = await Promise.all([
        prisma.campus.findFirst({ where: { id: archived.campusId, archivedAt: null, ...(user.schoolId ? { schoolId: user.schoolId } : {}) }, select: { id: true } }),
        prisma.class.findFirst({ where: { id: { not: id }, campusId: archived.campusId, name: archived.name, section: archived.section, academicYear: archived.academicYear, archivedAt: null }, select: { id: true } }),
      ]);
      if (!campus) throw new ApiError("Restore requires an active campus", 409);
      if (conflict) throw new ApiError("A class with this name, section and academic year already exists in this campus", 409);
      await prisma.class.update({ where: { id }, data: { archivedAt: null, archiveReason: null, status: archived.archivePreviousStatus || "ACTIVE", archivePreviousStatus: null } });
      await prisma.auditLog.create({ data: { tableName: "class", recordId: id, oldValue: { archived: true }, newValue: { archived: false }, userId: user.userId } });
      return Response.json({ success: true, restored: true });
    }

    const existing = await prisma.class.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
      select: { id: true, campusId: true, classTeacherId: true, teachingMode: true },
    });
    if (!existing) throw new ApiError("Class not found", 404);

    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.section !== undefined) data.section = body.section ? String(body.section).trim() : null;
    if (body.academicYear !== undefined) data.academicYear = Number(body.academicYear);
    if (body.classTeacherId !== undefined || body.teacherId !== undefined) {
      data.classTeacherId = await assertTeacherInCampus(body.classTeacherId || body.teacherId, existing.campusId, user.schoolId);
    }
    if (body.teachingMode !== undefined) {
      const mode = String(body.teachingMode).toUpperCase();
      if (mode !== "SINGLE" && mode !== "SUBJECT") {
        throw new ApiError("teachingMode must be SINGLE or SUBJECT", 400);
      }
      data.teachingMode = mode;
    }

    const cls = await prisma.class.update({
      where: { id },
      data,
      include: {
        classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
        _count: { select: { students: true, subjects: true } },
      },
    });

    // In SINGLE mode the class teacher owns every subject, so keep subjects in
    // lockstep — but ONLY when the class teacher is actually (re)assigned.
    // Merely toggling the teachingMode flag must stay lightweight and
    // non-destructive: overwriting every subject on a mode switch used to wipe
    // individually-assigned per-subject teachers (and, with no class teacher
    // set, null them all out). The flag alone is enough — the UI presents
    // SINGLE as "the class teacher teaches everything" regardless of what each
    // subject row currently stores.
    const effectiveMode = data.teachingMode ?? existing.teachingMode;
    const teacherChanged = data.classTeacherId !== undefined && data.classTeacherId !== existing.classTeacherId;
    let clashes: TimetableClash[] = [];
    if (effectiveMode === "SINGLE" && teacherChanged) {
      await prisma.subject.updateMany({
        where: { classId: id },
        data: { teacherId: cls.classTeacherId },
      });
      // Move the timetable with the assignment, then surface any resulting
      // double-booking so the admin finds out here rather than on the day.
      const affected = await prisma.subject.findMany({ where: { classId: id }, select: { id: true } });
      await syncTimetableSlotsForSubjects(affected.map((s) => s.id), cls.classTeacherId);
      clashes = await detectTeacherClashes(cls.classTeacherId);
    }

    if (body.classTeacherId !== undefined || body.teacherId !== undefined) {
      await prisma.auditLog.create({
        data: {
          tableName: 'class',
          recordId: id,
          oldValue: { classTeacherId: existing.classTeacherId },
          newValue: { classTeacherId: cls.classTeacher?.id || null },
          userId: user.userId,
        }
      });
    }

    notify("CLASS_UPDATED", {
      schoolId: user.schoolId,
      campusId: existing.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className: cls.name,
      section: cls.section ?? undefined,
      classId: id,
    });

    return Response.json({ success: true, data: cls, clashes });
  } catch (error) {
    return errorResponse(error, "[classes] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Class id is required", 400);

    const existing = await prisma.class.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      select: { id: true, campusId: true, name: true, section: true, academicYear: true, status: true, archivedAt: true, archivePreviousStatus: true, _count: { select: { students: true, subjects: true, exams: true, feeStructures: true, attendance: true, timetables: true, classHistory: true, admissionQueries: true } } },
    });
    if (!existing) throw new ApiError("Class not found", 404);
    const dependencies = { students: existing._count.students, subjects: existing._count.subjects, exams: existing._count.exams, feeStructures: existing._count.feeStructures, attendance: existing._count.attendance, timetables: existing._count.timetables, classHistory: existing._count.classHistory, admissionQueries: existing._count.admissionQueries };
    if (new URL(req.url).searchParams.get("preview") === "true") return Response.json({ success: true, action: "archive", record: `${existing.name}${existing.section ? ` ${existing.section}` : ""}`, dependencies, permanentDeletion: "restricted when history exists" });
    if (existing.archivedAt) return Response.json({ success: true, archived: true, alreadyArchived: true, dependencies });
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Administrative archive";
    await prisma.class.update({ where: { id }, data: { archivedAt: new Date(), archiveReason: reason, archivePreviousStatus: existing.status, status: "COMPLETED" } });
    await prisma.auditLog.create({ data: { tableName: "class", recordId: id, oldValue: { archived: false }, newValue: { archived: true, reason, dependencies }, userId: user.userId } });
    notify("CLASS_DELETED", {
      schoolId: user.schoolId,
      campusId: existing.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className: existing.name,
    });
    return Response.json({ success: true, archived: true, dependencies, message: "Class archived. Its academic and financial history is preserved." });
  } catch (error) {
    return errorResponse(error, "[classes] DELETE failed");
  }
}
