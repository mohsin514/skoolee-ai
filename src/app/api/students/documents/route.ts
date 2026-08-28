import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { deleteFile, getDownloadUrl } from "@/lib/storage/s3";

// Student admission documents.
// GET  /api/students/documents?studentId=    — list (campus-scoped)
// POST /api/students/documents               — { studentId, kind, fileKey, fileName } after presigned PUT
// DELETE /api/students/documents?id=         — removes the S3 object + row

const DOC_KINDS = new Set(["BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "PHOTO", "OTHER"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // These are birth certificates, transfer certificates and ID photos, and
    // the response carries a presigned download URL for each one. The handler
    // was school-scoped but ungated, so any signed-in account — every student
    // and guardian included — could read another child's file simply by
    // guessing its id. Staff-only, on the same students.view bit as the roster.
    await assertModuleRead(user, "students");
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId required", 400);

    const documents = await prisma.studentDocument.findMany({
      where: {
        studentId,
        student: { campus: { schoolId: user.schoolId } },
      },
      select: {
        id: true,
        kind: true,
        fileKey: true,
        fileName: true,
        uploadedAt: true,
      },
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
    return errorResponse(error, "[students/documents] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "students", "edit");
    const body = await req.json();
    const { studentId, kind, fileKey, fileName } = body as {
      studentId?: string;
      kind?: string;
      fileKey?: string;
      fileName?: string;
    };
    if (!studentId) throw new ApiError("studentId is required", 400);
    if (!kind || !DOC_KINDS.has(String(kind).toUpperCase())) {
      throw new ApiError("kind must be BIRTH_CERTIFICATE, TRANSFER_CERTIFICATE, PHOTO or OTHER", 400);
    }
    if (!fileKey || !fileName) throw new ApiError("fileKey and fileName are required", 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, campus: { schoolId: user.schoolId } },
      select: { id: true, fullName: true },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const document = await prisma.studentDocument.create({
      data: {
        studentId: student.id,
        kind: String(kind).toUpperCase(),
        fileKey,
        fileName,
      },
    });

    await prisma.studentTimelineEvent.create({
      data: {
        studentId: student.id,
        kind: "DOC_UPLOADED",
        title: `Document uploaded: ${document.fileName}`,
        detail: `Kind: ${document.kind}`,
        actorId: user.userId,
      },
    });

    return Response.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[students/documents] POST failed");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    assertStaffRole(user);
    await assertPermission(user, "students", "delete");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id is required", 400);

    const doc = await prisma.studentDocument.findFirst({
      where: { id, student: { campus: { schoolId: user.schoolId } } },
    });
    if (!doc) throw new ApiError("Document not found", 404);

    await prisma.studentDocument.delete({ where: { id: doc.id } });
    await deleteFile(doc.fileKey).catch(() => {}); // best-effort S3 cleanup

    await prisma.studentTimelineEvent.create({
      data: {
        studentId: doc.studentId,
        kind: "NOTE",
        title: `Document removed: ${doc.fileName}`,
        actorId: user.userId,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "[students/documents] DELETE failed");
  }
}