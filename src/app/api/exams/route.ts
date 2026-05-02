import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { examSchema, examStatusSchema } from "@/lib/validators/schemas";

function canManageExams(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

export async function GET(req: NextRequest) {
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
      _count: { select: { marks: true, reportCards: true } },
    },
    orderBy: [{ academicYear: "desc" }, { title: "asc" }],
  });

  return Response.json({ success: true, exams });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canManageExams(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

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

  const exam = await prisma.exam.create({
    data: {
      campusId: cls.campusId,
      classId: parsed.data.classId,
      title: parsed.data.title,
      term: parsed.data.term,
      academicYear: parsed.data.academicYear,
      status: "DRAFT",
    },
    include: {
      class: { select: { id: true, name: true, section: true, academicYear: true } },
      _count: { select: { marks: true, reportCards: true } },
    },
  });

  return Response.json({ success: true, exam }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canManageExams(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

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
      _count: { select: { marks: true, reportCards: true } },
    },
  });

  return Response.json({ success: true, exam: updated });
}
