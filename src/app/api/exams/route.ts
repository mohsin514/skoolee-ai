import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { examSchema, examStatusSchema } from "@/lib/validators/schemas";
import { notify } from "@/lib/notifications/in-app";
import { assertPermission } from "@/lib/permissions";

function canManageExams(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || role === "TEACHER" || isCampusAdminRole(role);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;

    const { searchParams } = new URL(req.url);
    const campusId = searchParams.get("campusId") || user.campusId;
    const classId = searchParams.get("classId");
    const status = searchParams.get("status");

    if (!campusId && user.role !== "SUPER_ADMIN") {
      return Response.json({ error: "campusId required" }, { status: 400 });
    }

    const exams = await prisma.exam.findMany({
      where: {
        campus: { schoolId: user.schoolId, ...(campusId ? { id: campusId } : {}) },
        ...(classId ? { classId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        locker: { select: { fullName: true } },
        subject: { select: { id: true, name: true, totalMarks: true } },
        _count: { select: { marks: true, reportCards: true } },
      },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
    });

    return Response.json({ success: true, exams });
  } catch (error) {
    console.error("[exams] GET failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}

const EXAM_TYPES = ["QUIZ", "CLASS_TEST", "MID_TERM", "FINAL", "CUSTOM"];

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canManageExams(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "add");

    const body = await req.json();
    const parsed = examSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: {
        id: parsed.data.classId,
        campus: {
          schoolId: user.schoolId,
          ...(user.role === "SUPER_ADMIN" ? {} : { id: user.campusId || "" }),
        },
      },
      select: { id: true, campusId: true },
    });

    if (!cls) return Response.json({ error: "Class not found" }, { status: 404 });

    // If teacher, verify they are assigned to this class
    if (user.role === "TEACHER") {
      const isAssigned = await prisma.subject.findFirst({
        where: { classId: parsed.data.classId, teacherId: user.userId, campusId: cls.campusId },
      });
      const isClassTeacher = await prisma.class.findFirst({
        where: { id: parsed.data.classId, classTeacherId: user.userId },
      });
      if (!isAssigned && !isClassTeacher) {
        return Response.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
    }

    const examType = body.examType && EXAM_TYPES.includes(body.examType) ? body.examType : "CLASS_TEST";

    const subjectFilter = parsed.data.subjectId
      ? { id: parsed.data.subjectId }
      : {};
    const subjects = await prisma.subject.findMany({
      where: { classId: parsed.data.classId, campusId: cls.campusId, ...subjectFilter },
      select: { totalMarks: true },
    });
    const totalMarks = subjects.reduce((sum, s) => sum + s.totalMarks, 0);

    // If a specific subject is selected, verify it belongs to the class
    if (parsed.data.subjectId && subjects.length === 0) {
      return Response.json({ error: "Selected subject not found in this class" }, { status: 400 });
    }

    const exam = await prisma.exam.create({
      data: {
        campusId: cls.campusId,
        classId: parsed.data.classId,
        title: parsed.data.title,
        term: parsed.data.term,
        academicYear: parsed.data.academicYear,
        examType,
        subjectId: parsed.data.subjectId || null,
        totalMarks,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
  include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        _count: { select: { marks: true, reportCards: true } },
      },
    });

    notify("EXAM_CREATED", {
      schoolId: user.schoolId,
      campusId: cls.campusId,
      actorId: user.userId,
      actorName: user.fullName,
      examTitle: exam.title,
      className: [exam.class?.name, exam.class?.section].filter(Boolean).join(" "),
      classId: parsed.data.classId,
    });

    return Response.json({ success: true, exam }, { status: 201 });
  } catch (error) {
    console.error("[exams] POST failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canManageExams(user.role)) {
      return Response.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    await assertPermission(user, "exams", "edit");

    const body = await req.json();
    const parsed = examStatusSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { marks: true, reportCards: true } } },
    });

    if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
    if (user.campusId && exam.campusId !== user.campusId) {
      return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
    }

    const target = parsed.data.status;
    if (exam.isLocked && (target === "DRAFT" || target === "ACTIVE" || target === "MARKS_ENTRY")) {
      return Response.json({ error: "Locked exams cannot return to editable states" }, { status: 409 });
    }
    if (target === "DRAFT" && exam._count.marks > 0) {
      return Response.json({ error: "Exams with marks cannot return to draft" }, { status: 409 });
    }
    if (target === "PRINCIPAL_REVIEWED" && !exam.isLocked) {
      return Response.json({ error: "Only locked exams can be reviewed" }, { status: 409 });
    }
    if (target === "PUBLISHED" && exam.status !== "PRINCIPAL_REVIEWED") {
      return Response.json({ error: "Principal review is required before publishing" }, { status: 409 });
    }

    const now = new Date();
    const updated = await prisma.exam.update({
      where: { id: parsed.data.id },
      data: {
        status: target,
        ...(target === "ACTIVE" ? { activatedAt: exam.activatedAt || now } : {}),
        ...(target === "MARKS_ENTRY" ? { marksEntryAt: exam.marksEntryAt || now } : {}),
        ...(target === "PRINCIPAL_REVIEWED" ? { reviewedAt: now, reviewedBy: user.userId } : {}),
        ...(target === "PUBLISHED" ? { publishedAt: now } : {}),
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        locker: { select: { fullName: true } },
        subject: { select: { id: true, name: true, totalMarks: true } },
        _count: { select: { marks: true, reportCards: true } },
      },
    });

    if (target === "PUBLISHED") {
      notify("REPORT_CARDS_PUBLISHED", {
        schoolId: user.schoolId,
        campusId: exam.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        examTitle: updated.title,
        classId: updated.classId,
      });
    }

    return Response.json({ success: true, exam: updated });
  } catch (error) {
    console.error("[exams] PATCH failed", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
