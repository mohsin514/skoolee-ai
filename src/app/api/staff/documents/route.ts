import { operationDeleteResponse } from "@/lib/destructive/operations";
import { campusScope } from "@/lib/auth/policy";
import { matchesDocumentKey } from "@/lib/storage/document-key-scope";
import { privateDownloadResponse } from "@/lib/storage/private-download";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError, assertPermission, canManageCampusOps, errorResponse, requireAuthUser, resolveCampusId } from "@/lib/api/scope";
import { parseBody } from "@/lib/api/validate";
import { jsonObjectBody } from "@/lib/validators/route-bodies";

// Staff documents (CV, CNIC, degrees, contracts...).
// GET    /api/staff/documents?userId= — list (admin only, school-scoped)
// POST   /api/staff/documents         — { userId, kind, fileKey, fileName } after presigned PUT
// DELETE /api/staff/documents?id=     — removes the S3 object + row

const DOC_KINDS = new Set(["CV", "CNIC", "DEGREE", "CONTRACT", "PHOTO", "OTHER"]);

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "view");
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) throw new ApiError("userId required", 400);

    const documentId = req.nextUrl.searchParams.get("documentId");
    if (documentId) {
      const document = await prisma.staffDocument.findFirst({
        where: { id: documentId, userId, user: { role: { notIn: ["PARENT", "STUDENT", "APP_OWNER", "SUPER_ADMIN"] }, ...campusScope(user) } },
        select: { fileKey: true, fileName: true },
      });
      if (!document) throw new ApiError("Document not found", 404);
      const campusId = await resolveCampusId(user, document.fileKey.split("/")[1]);
      if (!matchesDocumentKey(document.fileKey, "staff-docs", campusId, userId)) throw new ApiError("Document not found", 404);
      return privateDownloadResponse(document.fileKey, document.fileName);
    }
    const documents = await prisma.staffDocument.findMany({
      where: { userId, user: { role: { notIn: ["PARENT", "STUDENT", "APP_OWNER", "SUPER_ADMIN"] }, ...campusScope(user) } },
      select: { id: true, kind: true, fileKey: true, fileName: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    });

    const data = documents.map(({ fileKey: _fileKey, ...doc }) => ({
      ...doc,
      downloadUrl: `/api/staff/documents?userId=${encodeURIComponent(userId)}&documentId=${encodeURIComponent(doc.id)}`,
    }));

    return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "[staff/documents] GET failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    if (!canManageCampusOps(user)) throw new ApiError("Insufficient permissions", 403);
    await assertPermission(user, "staff", "edit");
    const body = await parseBody(req, jsonObjectBody);
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
      where: { id: userId, role: { notIn: ["PARENT", "STUDENT", "APP_OWNER", "SUPER_ADMIN"] }, ...campusScope(user) },
      select: { id: true },
    });
    if (!staff) throw new ApiError("Staff member not found", 404);
    const campusId = await resolveCampusId(user, fileKey.split("/")[1]);
    if (!matchesDocumentKey(fileKey, "staff-docs", campusId, staff.id)) throw new ApiError("Document upload does not match this record", 400);

    const doc = await prisma.$transaction(async (tx) => {
      const created = await tx.staffDocument.create({
        data: { userId, kind: String(kind).toUpperCase(), fileKey, fileName },
      });
      await tx.staffTimelineEvent.create({
        data: {
          userId,
          kind: "DOCUMENT",
          title: "Document uploaded",
          detail: `${String(kind).toUpperCase()} — ${fileName}`,
          actorId: user.userId,
        },
      });
      await writeAuditEvent(tx, user, { table: "staff_documents", recordId: created.id, action: "CREATE", campusId, after: { userId, kind: created.kind } });
      return created;
    });
    return Response.json({ success: true, data: doc }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "[staff/documents] POST failed");
  }
}

export async function DELETE(request: NextRequest) {
  return operationDeleteResponse(request, "staff/documents");
}
