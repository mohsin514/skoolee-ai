// ===========================================
// SkooleeAI - BullMQ Queue Definitions
// ===========================================

import { Queue } from "bullmq";
import { redis } from "./connection";

export const remarkQueue = new Queue("ai-remarks", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  },
});

export const pdfQueue = new Queue("pdf-generation", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
  },
});

export const notificationQueue = new Queue("notifications", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
  },
});

// ─── Job Data Types ────────────────────────

export interface RemarkJobData {
  tenantId: string;
  schemaName: string;
  studentId: string;
  examId: string;
  language: "en" | "ur" | "both";
  tone?: "formal" | "encouraging" | "constructive";
}

export interface PdfJobData {
  tenantId: string;
  schemaName: string;
  studentId: string;
  examId: string;
  reportCardId: string;
}

export interface NotificationJobData {
  tenantId: string;
  schemaName: string;
  studentId: string;
  type: "WHATSAPP" | "EMAIL";
  recipient: string;
  message: string;
  attachmentUrl?: string;
}
