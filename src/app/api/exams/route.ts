// ─────────────────────────────────────────────────────────────────
// Diagram 3 — Exam Lock (Principal action)
// POST /api/exams/[id]/lock  — Lock exam: is_locked = true
// POST /api/exams/[id]/unlock — Unlock (SUPER_ADMIN only)
// GET  /api/exams            — List exams for campus
// POST /api/exams            — Create exam
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { examSchema } from "@/lib/validators/schemas";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const campusId = searchParams.get("campusId") || user.campusId;
  const classId = searchParams.get("classId");

  const exams = await prisma.exam.findMany({
    where: {
      campusId: campusId || undefined,
      ...(classId ? { classId } : {}),
    },
    include: {
      class: { select: { name: true, section: true } },
      locker: { select: { fullName: true } },
      _count: { select: { marks: true } },
    },
    orderBy: { academicYear: "desc" },
  });

  return Response.json({ success: true, exams });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPER_ADMIN", "PRINCIPAL"].includes(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = examSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const exam = await prisma.exam.create({
    data: {
      campusId: user.campusId!,
      classId: parsed.data.classId,
      title: parsed.data.title,
      term: parsed.data.term,
      academicYear: parsed.data.academicYear,
    },
  });

  return Response.json({ success: true, exam });
}
