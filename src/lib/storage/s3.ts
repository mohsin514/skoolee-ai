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
