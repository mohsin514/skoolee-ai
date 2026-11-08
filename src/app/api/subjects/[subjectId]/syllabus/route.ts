import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  canManageOperations,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

const TOPIC_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];

function isTopicOrder(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

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

    const body = await parseBody(req, jsonObjectBody);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ApiError("Topic title is required", 400);

    if (body.order !== undefined && !isTopicOrder(body.order)) throw new ApiError("Topic order must be a whole number", 400);

    // A retried or double-clicked add returns the topic already saved instead of a duplicate.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`syllabus-topic:${subjectId}`}))`;
      const existing = await tx.syllabusTopic.findFirst({
        where: { subjectId, title: { equals: title, mode: "insensitive" } },
      });
      if (existing) return { topic: existing, created: false };
      const count = await tx.syllabusTopic.count({ where: { subjectId } });
      const topic = await tx.syllabusTopic.create({
        data: {
          subjectId,
          title,
          description: body.description ? String(body.description).trim() : null,
          order: body.order !== undefined ? Number(body.order) : count,
        },
      });
      return { topic, created: true };
    });

    return Response.json({ success: true, data: result.topic }, { status: result.created ? 201 : 200 });
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

    const body = await parseBody(req, jsonObjectBody);
    if (!body.id) throw new ApiError("Topic id is required", 400);

    const existing = await prisma.syllabusTopic.findFirst({
      where: { id: body.id, subjectId },
      select: { id: true, status: true },
    });
    if (!existing) throw new ApiError("Topic not found", 404);

    const data: any = {};
    if (body.title !== undefined) {
      data.title = String(body.title ?? "").trim();
      if (!data.title) throw new ApiError("Topic title is required", 400);
    }
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.order !== undefined) {
      if (!isTopicOrder(body.order)) throw new ApiError("Topic order must be a whole number", 400);
      data.order = Number(body.order);
    }

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