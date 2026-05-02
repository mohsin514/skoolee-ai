// ===========================================
// SkooleeAI - Notification Worker
// ===========================================
// Processes WhatsApp, email, and automation jobs.

import { Worker, Job } from "bullmq";
import { redis } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { sendEmailMessage } from "@/lib/email";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { runNotificationAutomationSweep } from "@/lib/notifications/automation";
import {
  parseNotificationTemplateKey,
  sendTemplatedCommunication,
} from "@/lib/notifications/service";
import type { NotificationJobData } from "@/lib/queue/queues";

const worker = new Worker<NotificationJobData>(
  "notifications",
  async (job: Job<NotificationJobData>) => {
    const data = job.data;

    if ("kind" in data && data.kind === "RUN_AUTOMATION") {
      const results = await runNotificationAutomationSweep({
        schoolId: data.schoolId,
        campusId: data.campusId,
        trigger: data.trigger,
      });
      return { processed: results.length };
    }

    if ("kind" in data && data.kind === "SEND_TEMPLATE") {
      const templateKey = parseNotificationTemplateKey(data.templateKey);
      if (!templateKey) throw new Error(`Unknown notification template: ${data.templateKey}`);

      const communication = await sendTemplatedCommunication({
        key: templateKey,
        channel: data.channel,
        context: data.context || {},
        target: {
          schoolId: data.schoolId,
          campusId: data.campusId,
          studentId: data.studentId,
          parentUserId: data.parentUserId,
          recipientName: data.recipientName,
          recipient: data.recipient,
        },
        attachmentUrl: data.attachmentUrl,
        relatedType: data.relatedType,
        relatedId: data.relatedId,
        approvedData: Boolean(data.approvedData),
        idempotencyKey: data.idempotencyKey,
        metadata: data.metadata,
      });

      if (communication.status === "FAILED") {
        throw new Error(communication.failedReason || "Notification failed");
      }

      return { status: communication.status, communicationId: communication.id };
    }

    const legacyData = data as Extract<NotificationJobData, { type: "WHATSAPP" | "EMAIL" }>;
    const result =
      legacyData.type === "WHATSAPP"
        ? await sendWhatsAppMessage({
            to: legacyData.recipient,
            text: legacyData.message,
            pdfUrl: legacyData.attachmentUrl,
          })
        : await sendEmailMessage({
            to: legacyData.recipient,
            subject: "School notification",
            text: legacyData.message,
          });

    if (legacyData.tenantId) {
      const student = legacyData.studentId
        ? await prisma.student.findUnique({ where: { id: legacyData.studentId }, select: { campusId: true, parentUserId: true } })
        : null;

      await prisma.parentCommunication.create({
        data: {
          schoolId: legacyData.tenantId,
          campusId: student?.campusId || null,
          studentId: legacyData.studentId || null,
          parentUserId: student?.parentUserId || null,
          templateKey: "LEGACY_MESSAGE",
          channel: legacyData.type,
          recipient: legacyData.recipient,
          subject: legacyData.type === "EMAIL" ? "School notification" : null,
          body: legacyData.message,
          attachmentUrl: legacyData.attachmentUrl || null,
          status: result.success ? "SENT" : "FAILED",
          providerMessageId: result.messageId || null,
          failedReason: result.success ? null : result.error || "Delivery failed",
          approvedData: false,
          sentAt: result.success ? new Date() : null,
          metadata: { queueJobId: job.id },
        },
      });
    }

    if (!result.success) {
      throw new Error(result.error || "Notification failed");
    }

    return { status: "SENT" };
  },
  {
    connection: redis,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`[Notification Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Notification Worker] Job ${job?.id} failed:`, err);
});

export default worker;
