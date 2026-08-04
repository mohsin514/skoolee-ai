import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { subjectSchema } from "@/lib/validators/schemas";
import { notify } from "@/lib/notifications/in-app";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";

async function getScopedClass(classId: string, userCampusId: string | null, schoolId: string) {
  const cls = await prisma.class.findFirst({
    where: {
      id: classId,
      campus: { schoolId },
      ...(userCampusId ? { campusId: userCampusId } : {}),
    },
    select: { id: true, campusId: true },
  });

  if (!cls) throw new ApiError("Class not found", 404);
  return cls;
}

async function assertTeacher(teacherId: string | null | undefined, campusId: string, schoolId: string) {
  if (!teacherId) return null;

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, campusId, schoolId, role: "TEACHER", isActive: true },
    select: { id: true },
  });

  if (!teacher) throw new ApiError("Teacher is not active in this campus", 400);
  return teacher.id;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const subjects = await prisma.subject.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(classId ? { classId } : {}),
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true, isActive: true } },
      },
      orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
    });

    return Response.json({ success: true, data: subjects });
  } catch (error) {
    return errorResponse(error, "[subjects] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    const parsed = subjectSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const cls = await getScopedClass(
      parsed.data.classId,
      user.role === "SUPER_ADMIN" ? body.campusId || null : user.campusId,
      user.schoolId
    );
    const teacherId = await assertTeacher(parsed.data.teacherId, cls.campusId, user.schoolId);
    const totalMarks = parsed.data.totalMarks || parsed.data.maxMarks || 100;
    const existing = await prisma.subject.findFirst({
      where: {
        campusId: cls.campusId,
        classId: parsed.data.classId,
        name: { equals: parsed.data.name.trim(), mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) throw new ApiError("This subject already exists in the selected section", 409);

    const subject = await prisma.subject.create({
      data: {
        campusId: cls.campusId,
        classId: parsed.data.classId,
        name: parsed.data.name.trim(),
        teacherId,
        totalMarks,
      },
      include: {
        class: { select: { id: true, name: true, section: true } },
        teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'subject',
        recordId: subject.id,
        newValue: { name: subject.name, totalMarks: subject.totalMarks },
        userId: user.userId,
      }
    });

    notify("SUBJECT_CREATED", {
      schoolId: user.schoolId,
      campusId: cls.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      subjectName: subject.name,
      className: [subject.class?.name, subject.class?.section].filter(Boolean).join(" "),
      classId: subject.classId,
      teacherId: subject.teacherId ?? undefined,
    });

    return Response.json({ success: true, data: subject }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[subjects] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await req.json();
    if (!body.id) throw new ApiError("Subject id is required", 400);

    const existing = await prisma.subject.findFirst({
      where: { id: body.id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? body.campusId : user.campusId) },
      select: { id: true, campusId: true, name: true },
    });
    if (!existing) throw new ApiError("Subject not found", 404);

    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.totalMarks !== undefined) data.totalMarks = Number(body.totalMarks);
    if (body.teacherId !== undefined) data.teacherId = await assertTeacher(body.teacherId, existing.campusId, user.schoolId);
    if (body.classId !== undefined) {
      const cls = await getScopedClass(body.classId, existing.campusId, user.schoolId);
      data.classId = cls.id;
    }

    const subject = await prisma.subject.update({
      where: { id: body.id },
      data,
      include: {
        class: { select: { id: true, name: true, section: true } },
        teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'subject',
        recordId: body.id,
        oldValue: { name: existing.name },
        newValue: { name: subject.name, teacherId: subject.teacher?.id || null },
        userId: user.userId,
      }
    });

    if (body.teacherId !== undefined && subject.teacher) {
      notify("SUBJECT_TEACHER_ASSIGNED", {
        schoolId: user.schoolId,
        campusId: existing.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        teacherName: subject.teacher.fullName,
        subjectName: subject.name,
        className: [subject.class?.name, subject.class?.section].filter(Boolean).join(" "),
        teacherId: subject.teacherId ?? undefined,
      });
    }

    return Response.json({ success: true, data: subject });
  } catch (error) {
    return errorResponse(error, "[subjects] PATCH failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Subject id is required", 400);

    const subject = await prisma.subject.findFirst({
      where: { id, ...scopedCampusWhere(user, user.role === "SUPER_ADMIN" ? null : user.campusId) },
      include: { _count: { select: { marks: true } } },
    });
    if (!subject) throw new ApiError("Subject not found", 404);
    if (subject._count.marks > 0) {
      throw new ApiError("Subjects with marks cannot be deleted", 409);
    }

    await prisma.subject.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        tableName: 'subject',
        recordId: id,
        oldValue: { name: subject.name, deleted: true },
        userId: user.userId,
      }
    });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[subjects] DELETE failed");
  }
}
