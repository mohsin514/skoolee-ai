import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { subjectSchema } from "@/lib/validators/schemas";
import { createCampusSubjects } from "@/lib/academic/subject-write";
import { SUBJECT_PACKS } from "@/lib/academic/subject-catalogue";
import { notify } from "@/lib/notifications/in-app";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  assertStaffRole,
  requireAuthUser,
  resolveCampusId,
  scopedCampusWhere,
} from "@/lib/api/scope";
import { deleteSubjectWithTimetableSync, updateSubjectWithTeacherAssignment } from "@/lib/api/teacher-assignments";
import { academicImpact } from "@/lib/academic/structure";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // Campus-wide structure is staff data. Families see only their own class
    // through the student/parent endpoints.
    assertStaffRole(user);
    const { searchParams } = new URL(req.url);
    const requestedCampusId = searchParams.get("campusId");
    const classId = searchParams.get("classId");
    // SKAI-149: archived subjects keep their history but leave pickers unless asked for.
    const includeArchived = searchParams.get("includeArchived") === "true";
    const campusId = user.role === "SUPER_ADMIN" && !requestedCampusId
      ? null
      : await resolveCampusId(user, requestedCampusId);

    const subjects = await prisma.subject.findMany({
      where: {
        ...scopedCampusWhere(user, campusId),
        ...(classId ? { classId } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
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

    const body = await parseBody(req, jsonObjectBody);
    const pack = typeof body.packId === "string" ? SUBJECT_PACKS[body.packId] : undefined;
    if (body.packId !== undefined && !pack) throw new ApiError("Choose a curriculum pack.", 400);
    const parsed = subjectSchema.safeParse(pack ? { ...body, name: pack.label } : body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { subject, cls, createdCount, skippedCount } = await createCampusSubjects(user, { classId: parsed.data.classId, campusId: body.campusId, name: parsed.data.name, code: parsed.data.code, isElective: parsed.data.isOptional, pack: pack?.subjects, teacherId: parsed.data.teacherId, totalMarks: parsed.data.totalMarks || parsed.data.maxMarks || 100, applyToAllSections: body.applyToAllSections === true });

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

    return Response.json(
      { success: true, data: subject, createdCount, skippedCount },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "[subjects] POST failed");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const body = await parseBody(req, jsonObjectBody);
    if (!body.id) throw new ApiError("Subject id is required", 400);

    const { existing, subject, clashes } = await updateSubjectWithTeacherAssignment(user, body);

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

    return Response.json({ success: true, data: subject, clashes });
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
    // SKO-462: the impact is shown before a subject is removed.
    if (searchParams.get("preview") === "true") return Response.json({ success: true, action: "delete", impact: await schoolAiTransaction(user, tx => academicImpact(tx, user, "subject", id)) });

    await deleteSubjectWithTimetableSync(user, id);

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[subjects] DELETE failed");
  }
}
