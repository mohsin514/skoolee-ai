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
  userId?: string;
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

export type NotificationJobData =
  | {
      kind: "SEND_TEMPLATE";
      schoolId: string;
      campusId?: string | null;
      studentId?: string | null;
      parentUserId?: string | null;
      templateKey: string;
      channel: "WHATSAPP" | "EMAIL" | "SMS";
      recipient?: string | null;
      recipientName?: string | null;
      context?: Record<string, string | number | boolean | null | undefined>;
      attachmentUrl?: string | null;
      relatedType?: string | null;
      relatedId?: string | null;
      approvedData?: boolean;
      idempotencyKey?: string;
      metadata?: Record<string, unknown>;
    }
  | {
      kind: "RUN_AUTOMATION";
      schoolId?: string;
      campusId?: string | null;
      trigger?: string;
    }
  | {
      tenantId?: string;
      schemaName?: string;
      studentId?: string;
      type: "WHATSAPP" | "EMAIL";
      recipient: string;
      message: string;
      attachmentUrl?: string;
    };
