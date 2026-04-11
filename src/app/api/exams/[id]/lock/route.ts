// ─────────────────────────────────────────────────────────────────
// Diagram 3 — Exam Lock/Unlock endpoints
// POST /api/exams/[id]/lock
// POST /api/exams/[id]/unlock
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Only Principal / Admin can lock
  if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    return Response.json({ error: "Only admins/principals can lock exams" }, { status: 403 });
  }

  const { id } = await params;
  const exam = await prisma.exam.findUnique({ where: { id } });
  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  if (exam.isLocked) return Response.json({ error: "Exam already locked" }, { status: 400 });

  const locked = await prisma.exam.update({
    where: { id },
    data: {
      isLocked: true,
      lockedBy: user.userId,
      lockedAt: new Date(),
    },
  });

  return Response.json({ success: true, exam: locked });
}
