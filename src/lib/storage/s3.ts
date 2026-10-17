// ===========================================
// SkooleeAI - S3 / R2 Storage Client
// ===========================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ENDPOINT
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || "skooleeai-reports";

/**
 * Upload a PDF buffer to S3/R2.
 * Returns the object key.
 */
export async function uploadPdf(
  key: string,
  pdfBuffer: Buffer
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    })
  );
  return key;
}

/** Private download routes keep object credentials and expiring URLs on the server. */
export async function readPrivateObject(key: string): Promise<ReadableStream<Uint8Array>> {
  const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(30000) });
  if (!object.Body) throw new Error("Private object body is unavailable");
  return object.Body.transformToWebStream() as ReadableStream<Uint8Array>;
}

/** A completed upload cannot be overwritten by replaying a retained upload intent. */
export async function uploadPrivateObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: bytes, ContentType: contentType, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(30000) });
}

/** Size and type of a stored private object, or null when nothing was stored under the key. */
export async function headPrivateObject(key: string): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(10000) });
    return { sizeBytes: Number(head.ContentLength ?? -1), contentType: head.ContentType ?? null };
  } catch (error) {
    const status = error && typeof error === "object" && "$metadata" in error ? (error.$metadata as { httpStatusCode?: number })?.httpStatusCode : undefined;
    if (status === 404 || (error instanceof Error && error.name === "NotFound")) return null;
    throw error;
  }
}

/**
 * Delete a file from S3/R2.
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Generate a standard key for a report card PDF.
 */
export function reportCardKey(
  tenantId: string,
  examId: string,
  studentId: string
): string {
  return `reports/${tenantId}/${examId}/${studentId}.pdf`;
}

/** Only public-facing images may receive a direct browser PUT URL. */
const DIRECT_UPLOAD_PREFIXES = ["profile-images/", "logos/"];

/**
 * Presigned browser PUT for profile pictures and logos only. Private documents
 * (admission, staff, chat) must use the authenticated upload intent in
 * src/lib/storage/private-upload.ts, so this refuses any other key.
 */
export async function getUploadUrl(key: string, contentType: string, expiresIn = 900): Promise<string> {
  if (!DIRECT_UPLOAD_PREFIXES.some(prefix => key.startsWith(prefix)) || key.includes("..")) {
    throw new Error("Direct uploads are limited to profile pictures and logos");
  }
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn });
}

/**
 * Standard key for an admission document, e.g.
 * student-docs/{campusId}/{studentId}/{uuid}.{ext}
 */
export function documentKey(
  campusId: string,
  studentId: string,
  fileName: string
): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `student-docs/${campusId}/${studentId}/${safe}`;
}

/**
 * Standard key for a staff document, e.g.
 * staff-docs/{campusId}/{userId}/{uuid}.{ext}
 */
export function staffDocumentKey(
  campusId: string,
  userId: string,
  fileName: string
): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `staff-docs/${campusId}/${userId}/${safe}`;
}

/**
 * Key for a chat attachment.
 *
 * Prefixed with the school so a bucket-level policy or lifecycle rule can be
 * written per tenant, and the conversation id keeps one thread's files
 * together for retention sweeps.
 */
export function chatAttachmentKey(
  schoolId: string,
  conversationId: string,
  fileName: string
): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `chat/${schoolId}/${conversationId}/${safe}`;
}

function safeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function profileImageKey(
  schoolId: string,
  userId: string,
  fileName: string
): string {
  const safe = safeFileName(fileName);
  return `profile-images/${schoolId}/${userId}/${crypto.randomUUID()}-${safe}`;
}

export function schoolLogoKey(
  schoolId: string,
  fileName: string
): string {
  const safe = safeFileName(fileName);
  return `logos/school/${schoolId}/${crypto.randomUUID()}-${safe}`;
}

export function campusLogoKey(
  schoolId: string,
  campusId: string,
  fileName: string
): string {
  const safe = safeFileName(fileName);
  return `logos/campus/${schoolId}/${campusId}/${crypto.randomUUID()}-${safe}`;
}

const S3_KEY_PREFIXES = ["profile-images/", "logos/", "student-docs/", "staff-docs/", "chat/", "reports/", "resources/", "submissions/"];

function isS3Key(value: string): boolean {
  return S3_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function resolveMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isS3Key(value)) return `/api/media/${value}`;
  return value;
}

/** Presigned read for public images (logos, profile pictures) embedded server-side, e.g. in PDFs. */
async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!DIRECT_UPLOAD_PREFIXES.some(prefix => key.startsWith(prefix)) || key.includes("..")) {
    throw new Error("Direct downloads are limited to profile pictures and logos");
  }
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

export async function resolveMediaUrlAsync(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isS3Key(value)) return value;
  // Private document keys are never turned into bearer URLs; they use private-download.
  return DIRECT_UPLOAD_PREFIXES.some(prefix => value.startsWith(prefix)) ? getDownloadUrl(value) : null;
}

export async function getObjectStream(key: string): Promise<{
  body: import("stream").Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return {
    body: res.Body as import("stream").Readable,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
  };
}
