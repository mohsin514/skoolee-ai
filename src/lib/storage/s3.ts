// ===========================================
// SkooleeAI - S3 / R2 Storage Client
// ===========================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

/**
 * Generate a pre-signed URL for downloading a report card PDF.
 */
export async function getDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
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

/**
 * Generate a pre-signed URL the browser can PUT to directly (documents,
 * images, uploads). Returns the key + presigned PUT URL.
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
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
