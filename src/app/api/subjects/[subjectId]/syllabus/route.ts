import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

const TOPIC_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

async function getScopedSubject(subjectId: string, userCampusId: string | null, schoolId: string) {
  const subject = await prisma.subject.findFirst({
    where: {
      id: subjectId,
      campus: { schoolId },
      ...(userCampusId ? { campusId: userCampusId } : {}),
    },
    select: { id: true, campusId: true, name: true, classId: true },
  });

  if (!subject) throw new ApiError("Subject not found", 404);
  return subject;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const user = await requireAuthUser();
    const { subjectId } = await params;
    await getScopedSubject(subjectId, user.role === "SUPER_ADMIN" ? null : user.campusId, user.schoolId);

    const topics = await prisma.syllabusTopic.findMany({
      where: { subjectId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return Response.json({ success: true, data: topics });
  } catch (error) {
    return errorResponse(error, "[subjects/syllabus] GET failed");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { subjectId } = await params;
    const subject = await getScopedSubject(subjectId, user.campusId, user.schoolId);

    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) throw new ApiError("Topic title is required", 400);

    const count = await prisma.syllabusTopic.count({ where: { subjectId } });
    const topic = await prisma.syllabusTopic.create({
      data: {
        subjectId,
        title,
        description: body.description ? String(body.description).trim() : null,
        order: Number.isFinite(body.order) ? Number(body.order) : count,
      },
    });

    return Response.json({ success: true, data: topic }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[subjects/syllabus] POST failed");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { subjectId } = await params;
    await getScopedSubject(subjectId, user.campusId, user.schoolId);

    const body = await req.json();
    if (!body.id) throw new ApiError("Topic id is required", 400);

    const existing = await prisma.syllabusTopic.findFirst({
      where: { id: body.id, subjectId },
      select: { id: true, status: true },
    });
    if (!existing) throw new ApiError("Topic not found", 404);

    const data: any = {};
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.order !== undefined) data.order = Number(body.order);

    if (body.status !== undefined) {
      if (!TOPIC_STATUSES.includes(body.status)) throw new ApiError("Invalid topic status", 400);
      data.status = body.status;
      data.completedAt = body.status === "COMPLETED" ? new Date() : null;
    }

    const topic = await prisma.syllabusTopic.update({
      where: { id: body.id },
      data,
    });

    return Response.json({ success: true, data: topic });
  } catch (error) {
    return errorResponse(error, "[subjects/syllabus] PATCH failed");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ subjectId: string }> }
) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);

    const { subjectId } = await params;
    await getScopedSubject(subjectId, user.campusId, user.schoolId);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError("Topic id is required", 400);

    const existing = await prisma.syllabusTopic.findFirst({
      where: { id, subjectId },
      select: { id: true },
    });
    if (!existing) throw new ApiError("Topic not found", 404);

    await prisma.syllabusTopic.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[subjects/syllabus] DELETE failed");
  }
}