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
import { authorizeAssignment, updateClassWithTeacherAssignment } from "@/lib/api/teacher-assignments";
import { effectiveDate, findDuplicateClass, isIdentityConflict, recordTeachingAssignment } from "@/lib/academic/structure";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";

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
    // SKO-462: create inside the campus fence with the actor re-authorized; the normalized duplicate
    // check answers with the conflicting class, and the database index settles any concurrent create.
    let classes;
    try {
      classes = await schoolAiTransaction(user, async tx => {
        await lockTimetableCampus(tx, user.schoolId, campusId);
        await authorizeAssignment(tx, user, "students");
        if (!await tx.campus.findFirst({ where: { id: campusId, schoolId: user.schoolId, archivedAt: null }, select: { id: true } })) throw new ApiError("Classes can only be added to an active campus", 409);
        for (const section of targetSections) {
          const duplicate = await findDuplicateClass(tx, { schoolId: user.schoolId, campusId }, { name: className, section, academicYear: parsed.data.academicYear });
          if (duplicate) throw new ApiError(`${duplicate.name}${duplicate.section ? ` ${duplicate.section}` : ""} already exists for ${parsed.data.academicYear} (class ${duplicate.id}).`, 409);
        }
        const created = [];
        for (const section of targetSections) {
          const cls = await tx.class.create({
            data: { schoolId: user.schoolId, campusId, name: className, section, academicYear: parsed.data.academicYear, classTeacherId, teachingMode },
            include: {
              classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
              subjects: { include: { teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } }, orderBy: { name: "asc" } },
              _count: { select: { students: true, subjects: true } },
            },
          });
          if (classTeacherId) await recordTeachingAssignment(tx, user, { campusId, classId: cls.id, subjectId: null, teacherId: classTeacherId, from: effectiveDate(body.effectiveFrom) });
          created.push(cls);
        }
        await tx.auditLog.createMany({ data: created.map(cls => ({ schoolId: user.schoolId, tableName: "class", recordId: cls.id, newValue: { name: cls.name, section: cls.section, academicYear: cls.academicYear }, userId: user.userId })) });
        return created;
      });
    } catch (error) {
      if (isIdentityConflict(error)) throw new ApiError(`${className} already exists for ${parsed.data.academicYear}. Reload to see it.`, 409);
      throw error;
    }

    notify("CLASS_CREATED", {
      schoolId: user.schoolId,
      campusId,
      actorId: user.userId,
      actorName: user.fullName,
      className,
      section: sections.length ? sections.join(",") : undefined,
      classId: classes[0]?.id,
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

    const { existing, cls, clashes } = await updateClassWithTeacherAssignment(user, body);

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
    // Enrolled means active and not archived — the same rule the archive itself enforces.
    const enrolledStudents = await prisma.student.count({ where: { schoolId: user.schoolId, classId: id, archivedAt: null, status: "active" } });
    const dependencies = { students: enrolledStudents, subjects: existing._count.subjects, exams: existing._count.exams, feeStructures: existing._count.feeStructures, attendance: existing._count.attendance, timetables: existing._count.timetables, classHistory: existing._count.classHistory, admissionQueries: existing._count.admissionQueries };
    if (new URL(req.url).searchParams.get("preview") === "true") return Response.json({ success: true, action: "archive", record: `${existing.name}${existing.section ? ` ${existing.section}` : ""}`, dependencies, permanentDeletion: "restricted when history exists" });
    if (existing.archivedAt) return Response.json({ success: true, archived: true, alreadyArchived: true, dependencies });
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "Administrative archive";
    // SKO-462: archive inside the campus fence with delete authority re-checked, and never strand
    // enrolled students — they move to another class first, then the class is archived as history.
    await schoolAiTransaction(user, async tx => {
      await lockTimetableCampus(tx, user.schoolId, existing.campusId);
      await authorizeAssignment(tx, user, "students", "delete");
      const enrolled = await tx.student.count({ where: { schoolId: user.schoolId, classId: id, archivedAt: null, status: "active" } });
      if (enrolled) throw new ApiError(`${enrolled} enrolled student(s) are still in this class. Move them to another class before archiving it.`, 409);
      const archived = await tx.class.updateMany({ where: { id, schoolId: user.schoolId, archivedAt: null }, data: { archivedAt: new Date(), archiveReason: reason, archivePreviousStatus: existing.status, status: "COMPLETED" } });
      if (archived.count !== 1) throw new ApiError("This class changed meanwhile. Reload and try again.", 409);
      await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "class", recordId: id, oldValue: { archived: false }, newValue: { archived: true, reason, dependencies }, userId: user.userId } });
    });
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
