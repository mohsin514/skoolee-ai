import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { ApiError, canManageOperations, errorResponse, requireAuthUser } from "@/lib/api/scope";
import { deleteFile, getDownloadUrl } from "@/lib/storage/s3";

// Staff documents (CV, CNIC, degrees, contracts...).
// GET    /api/staff/documents?userId= — list (admin only, school-scoped)
// POST   /api/staff/documents         — { userId, kind, fileKey, fileName } after presigned PUT
// DELETE /api/staff/documents?id=     — removes the S3 object + row

const DOC_KINDS = new Set(["CV", "CNIC", "DEGREE", "CONTRACT", "PHOTO", "OTHER"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) throw new ApiError("userId required", 400);

    const documents = await prisma.staffDocument.findMany({
      where: { userId, user: { schoolId: user.schoolId } },
      select: { id: true, kind: true, fileKey: true, fileName: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    });

    const data = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        downloadUrl: await getDownloadUrl(doc.fileKey).catch(() => null),
      }))
    );

    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error, "[staff/documents] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const body = await req.json();
    const { userId, kind, fileKey, fileName } = body as {
      userId?: string;
      kind?: string;
      fileKey?: string;
      fileName?: string;
    };
    if (!userId) throw new ApiError("userId is required", 400);
    if (!kind || !DOC_KINDS.has(String(kind).toUpperCase())) {
      throw new ApiError("kind must be CV, CNIC, DEGREE, CONTRACT, PHOTO or OTHER", 400);
    }
    if (!fileKey || !fileName) throw new ApiError("fileKey and fileName are required", 400);

    const staff = await prisma.user.findFirst({
      where: { id: userId, schoolId: user.schoolId },
      select: { id: true },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);

    const doc = await prisma.staffDocument.create({
      data: { userId, kind: String(kind).toUpperCase(), fileKey, fileName },
    });
    await prisma.staffTimelineEvent.create({
      data: {
        userId,
        kind: "DOCUMENT",
        title: "Document uploaded",
        detail: `${String(kind).toUpperCase()} — ${fileName}`,
        actorId: user.userId,
      },
    });
    return Response.json({ success: true, data: doc }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff/documents] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageOperations(user)) throw new ApiError("Insufficient permissions", 403);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);

    const doc = await prisma.staffDocument.findFirst({
      where: { id, user: { schoolId: user.schoolId } },
    });
    if (!doc) throw new ApiError("Document not found", 404);

    await prisma.staffDocument.delete({ where: { id } });
    await deleteFile(doc.fileKey).catch(() => {});
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[staff/documents] DELETE failed");
  }
}
