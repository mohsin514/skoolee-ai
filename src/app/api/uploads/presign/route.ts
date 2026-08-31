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
import {
  documentKey,
  staffDocumentKey,
  profileImageKey,
  schoolLogoKey,
  campusLogoKey,
  getUploadUrl,
} from "@/lib/storage/s3";
import { randomUUID } from "crypto";

// POST /api/uploads/presign
// body: { studentId, fileName, contentType, kind? } — admission documents
//       { userId, fileName, contentType }           — staff documents
//       { kind: "profile", fileName, contentType, sizeBytes } — own profile picture
//       { kind: "school-logo", fileName, contentType, sizeBytes } — school logo
//       { kind: "campus-logo", campusId, fileName, contentType, sizeBytes } — campus logo
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

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_BYTES = 1_500_000; // 1.5 MB

function isCampusAdminLike(role: string) {
  return role === "SUPER_ADMIN" || role === "CAMPUS_ADMIN" || role === "ADMIN";
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthUser();
    const body = await req.json();
    const kind = String(body.kind ?? "");

    if (kind === "profile") {
      return presignProfileImage(user, body);
    }
    if (kind === "school-logo") {
      return presignSchoolLogo(user, body);
    }
    if (kind === "campus-logo") {
      return presignCampusLogo(user, body);
    }

    // Legacy document presign — staff-only, gated by the documents permission.
    assertStaffRole(user);

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

function validateImageUpload(body: Record<string, unknown>) {
  const fileName = String(body.fileName ?? "").trim();
  const contentType = String(body.contentType ?? "").trim().toLowerCase();
  const sizeBytes = Math.round(Number(body.sizeBytes ?? 0));

  if (!fileName) throw new ApiError("fileName is required", 400);
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new ApiError("Only JPEG, PNG, WebP, and GIF images are allowed", 400);
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
    throw new ApiError("Image must be between 1 byte and 1.5 MB", 400);
  }
  return { fileName, contentType, sizeBytes };
}

async function presignProfileImage(user: Awaited<ReturnType<typeof requireAuthUser>>, body: Record<string, unknown>) {
  const { fileName, contentType } = validateImageUpload(body);
  const key = profileImageKey(user.schoolId, user.userId, fileName);
  const uploadUrl = await getUploadUrl(key, contentType);
  return Response.json({ success: true, data: { key, uploadUrl } });
}

async function presignSchoolLogo(user: Awaited<ReturnType<typeof requireAuthUser>>, body: Record<string, unknown>) {
  if (!isCampusAdminLike(user.role)) {
    throw new ApiError("Only administrators can change the school logo", 403);
  }
  if (user.role === "ADMIN") {
    const campusCount = await prisma.campus.count({ where: { schoolId: user.schoolId } });
    if (campusCount > 1) {
      throw new ApiError("Only the institution owner can change the school logo", 403);
    }
  }
  const { fileName, contentType } = validateImageUpload(body);
  const key = schoolLogoKey(user.schoolId, fileName);
  const uploadUrl = await getUploadUrl(key, contentType);
  return Response.json({ success: true, data: { key, uploadUrl } });
}

async function presignCampusLogo(user: Awaited<ReturnType<typeof requireAuthUser>>, body: Record<string, unknown>) {
  if (!isCampusAdminLike(user.role)) {
    throw new ApiError("Only administrators can change the campus logo", 403);
  }
  const campusId = String(body.campusId ?? "").trim();
  if (!campusId) throw new ApiError("campusId is required for campus logo upload", 400);

  const campus = await prisma.campus.findFirst({
    where: { id: campusId, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!campus) throw new ApiError("Campus not found", 404);

  if (user.role !== "SUPER_ADMIN" && user.campusId !== campusId) {
    throw new ApiError("You can only change the logo of your own campus", 403);
  }

  const { fileName, contentType } = validateImageUpload(body);
  const key = campusLogoKey(user.schoolId, campusId, fileName);
  const uploadUrl = await getUploadUrl(key, contentType);
  return Response.json({ success: true, data: { key, uploadUrl } });
}