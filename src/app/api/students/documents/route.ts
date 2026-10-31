import { operationDeleteResponse } from "@/lib/destructive/operations";
import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { NextRequest } from "next/server";
import { studentScope } from "@/lib/auth/policy";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { writeAuditEvent } from "@/lib/audit-events";
import {
  ApiError,
  assertModuleRead,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
} from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";
import { cleanStudentDocumentName, isStudentDocumentKind, studentDocumentContentType } from "@/lib/students/document-policy";

// Student admission documents.
// GET  /api/students/documents?studentId=    — list (campus-scoped)
// POST /api/students/documents               — { studentId, kind, fileKey, fileName } after presigned PUT
// DELETE /api/students/documents?id=         — removes the S3 object + row

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
    // SKAI-165: a student outside this account's school or campus is "not found", not an empty list.
    const student = await prisma.student.findFirst({ where: { id: studentId, ...studentScope(user) }, select: { id: true } });
    if (!student) throw new ApiError("Student not found", 404);
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
    const body = await parseBody(req, jsonObjectBody);
    const { studentId, kind, fileKey, fileName } = body as {
      studentId?: string;
      kind?: string;
      fileKey?: string;
      fileName?: string;
    };
    if (!studentId) throw new ApiError("studentId is required", 400);
    if (!isStudentDocumentKind(String(kind ?? "").toUpperCase())) {
      throw new ApiError("kind must be BIRTH_CERTIFICATE, TRANSFER_CERTIFICATE, PHOTO or OTHER", 400);
    }
    if (!fileKey || !fileName) throw new ApiError("fileKey and fileName are required", 400);
    // SKAI-165: the same allow-list the upload panel and presign apply, and a bounded, path-free name.
    const safeName = cleanStudentDocumentName(String(fileName));
    if (!safeName || !studentDocumentContentType({ name: safeName })) throw new ApiError("Only PDF, image, and Word documents are allowed", 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, ...studentScope(user) },
      select: { id: true, fullName: true, campusId: true },
    });
    if (!student) throw new ApiError("Student not found", 404);
    if (!matchesDocumentKey(fileKey, "student-docs", student.campusId, student.id)) throw new ApiError("Document upload does not match this record", 400);

    // SKAI-165: a retried or double-submitted save carries the same one-time key; return the
    // existing row instead of a duplicate document, timeline event and audit entry.
    const existing = await prisma.studentDocument.findFirst({ where: { studentId: student.id, fileKey }, select: { id: true, kind: true, fileName: true, uploadedAt: true } });
    if (existing) return Response.json({ success: true, data: existing, replayed: true }, { status: 200 });

    // SKAI-1396: two same-key requests can both pass the check above; the unique (studentId, fileKey)
    // index picks one winner, and the loser replays the winner's row without a second timeline or audit write.
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.studentDocument.create({
        data: {
          studentId: student.id,
          kind: String(kind).toUpperCase(),
          fileKey,
          fileName: safeName,
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
    }).catch(async (error: unknown) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const winner = await prisma.studentDocument.findFirst({ where: { studentId: student.id, fileKey }, select: { id: true, kind: true, fileName: true, uploadedAt: true } });
      if (!winner) throw error;
      return { replayed: true as const, winner };
    });

    if ("replayed" in document) return Response.json({ success: true, data: document.winner, replayed: true }, { status: 200 });
    return Response.json({ success: true, data: document }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[students/documents] POST failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "students/documents");
}
