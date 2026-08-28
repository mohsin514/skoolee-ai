import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ApiError,
  assertPermission,
  assertStaffRole,
  errorResponse,
  requireAuthUser,
  resolveCampusId,
} from "@/lib/api/scope";
import { documentKey, staffDocumentKey, getUploadUrl } from "@/lib/storage/s3";
import { randomUUID } from "crypto";

// POST /api/uploads/presign
// body: { studentId, fileName, contentType, kind? } — admission documents
//       { userId, fileName, contentType }           — staff documents
// Returns { key, uploadUrl } — a presigned S3 PUT the client uploads to
// directly, then a document row is created via the matching documents route.

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    // A presigned PUT is a writable handle into the school's document bucket,
    // under a key this route chooses for a student or staff member. Gated on
    // the same bit as the documents route it feeds, so an account that may not
    // attach a document cannot mint the URL that would upload one either.
    assertStaffRole(user);
    const body = await req.json();

    const studentId = String(body.studentId ?? "");
    const staffUserId = String(body.userId ?? "");
    const fileName = String(body.fileName ?? "").trim();
    const contentType = String(body.contentType ?? "").trim().toLowerCase();
    const sizeBytes = Math.round(Number(body.sizeBytes ?? 0));

    if (!studentId && !staffUserId) throw new ApiError("studentId or userId is required", 400);
    if (!fileName) throw new ApiError("fileName is required", 400);
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ApiError("Only PDF, image, and Word documents are allowed", 400);
    }
    if (sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
      throw new ApiError("File must be between 1 byte and 10 MB", 400);
    }

    if (staffUserId) {
      await assertPermission(user, "staff", "edit");
      const staff = await prisma.user.findFirst({
        where: { id: staffUserId, schoolId: user.schoolId },
        select: { id: true, campusId: true },
      });
      if (!staff) throw new ApiError("Staff member not found", 404);
      const campusId = await resolveCampusId(user, staff.campusId);
      const key = staffDocumentKey(campusId, staff.id, `${randomUUID()}-${fileName}`);
      const uploadUrl = await getUploadUrl(key, contentType);
      return Response.json({ success: true, data: { key, uploadUrl } });
    }

    await assertPermission(user, "students", "edit");

    const student = await prisma.student.findFirst({
      where: { id: studentId, campus: { schoolId: user.schoolId } },
      select: { id: true, campusId: true },
    });
    if (!student) throw new ApiError("Student not found", 404);

    const campusId = await resolveCampusId(user, student.campusId);

    const key = documentKey(campusId, student.id, `${randomUUID()}-${fileName}`);
    const uploadUrl = await getUploadUrl(key, contentType);
    return Response.json({ success: true, data: { key, uploadUrl } });
  } catch (error) {
    return errorResponse(error, "[uploads/presign] POST failed");
  }
}