import { operationDeleteResponse } from "@/lib/destructive/operations";
import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { NextRequest } from "next/server";
import { studentScope } from "@/lib/auth/policy";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";

// Student admission documents.
// GET  /api/students/documents?studentId=    — list (campus-scoped)
// POST /api/students/documents               — { studentId, kind, fileKey, fileName } after presigned PUT
// DELETE /api/students/documents?id=         — removes the S3 object + row

const DOC_KINDS = new Set(["BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "PHOTO", "OTHER"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // These are birth certificates, transfer certificates and ID photos, and
    // each download must recheck the current account and scope. The handler
    // was school-scoped but ungated, so any signed-in account — every student
    // and guardian included — could read another child's file simply by
    // guessing its id. Staff-only, on the same students.view bit as the roster.
    await assertModuleRead(user, "students");
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) throw new ApiError("studentId required", 400);

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (documentId) {
      const document = await prisma.studentDocument.findFirst({
        where: { id: documentId, studentId, student: studentScope(user) },
        select: { fileKey: true, fileName: true, student: { select: { campusId: true } } },
      });
      if (!document || !matchesDocumentKey(document.fileKey, "student-docs", document.student.campusId, studentId)) throw new ApiError("Document not found", 404);
      return privateDownloadResponse(document.fileKey, document.fileName);
    }
    const documents = await prisma.studentDocument.findMany({
      where: {
        studentId,
        student: studentScope(user),
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

    const data = documents.map(({ fileKey: _fileKey, ...doc }) => ({
      ...doc,
      downloadUrl: `/api/students/documents?studentId=${encodeURIComponent(studentId)}&documentId=${encodeURIComponent(doc.id)}`,
    }));

    return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
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
      where: { id: studentId, ...studentScope(user) },
      select: { id: true, fullName: true, campusId: true },
    });
    if (!student) throw new ApiError("Student not found", 404);
    if (!matchesDocumentKey(fileKey, "student-docs", student.campusId, student.id)) throw new ApiError("Document upload does not match this record", 400);

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.studentDocument.create({
        data: {
          studentId: student.id,
          kind: String(kind).toUpperCase(),
          fileKey,
          fileName,
        },
      });

      await tx.studentTimelineEvent.create({
        data: {
          studentId: student.id,
          kind: "DOC_UPLOADED",
          title: `Document uploaded: ${created.fileName}`,
          detail: `Kind: ${created.kind}`,
          actorId: user.userId,
        },
      });
      await writeAuditEvent(tx, user, { table: "student_documents", recordId: created.id, action: "CREATE", campusId: student.campusId, after: { studentId: student.id, kind: created.kind } });
      return created;
    });

    return Response.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[students/documents] POST failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "students/documents");
}
