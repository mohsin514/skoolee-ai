// ===========================================
// SkooleeAI - Notification Worker
// ===========================================
// Processes WhatsApp/Email notification jobs.

import { Worker, Job } from "bullmq";
import { redis } from "@/lib/queue/connection";
import { withTenant, tenantExec } from "@/lib/db/tenant";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import type { NotificationJobData } from "@/lib/queue/queues";

const worker = new Worker<NotificationJobData>(
  "notifications",
  async (job: Job<NotificationJobData>) => {
    const { schemaName, studentId, type, recipient, message, attachmentUrl } =
      job.data;

    console.log(
      `[Notification Worker] Sending ${type} to ${recipient}`
    );

    let status = "FAILED";
    let error: string | null = null;

    if (type === "WHATSAPP") {
      const result = await sendWhatsAppMessage({
        to: recipient,
        text: message,
        pdfUrl: attachmentUrl,
      });
      status = result.success ? "SENT" : "FAILED";
      error = result.error || null;
    }

    // TODO: Add email sending logic here for type === "EMAIL"

    // Log notification
    await withTenant(schemaName, async () => {
      return tenantExec(
        `INSERT INTO notifications (student_id, type, recipient, message, attachment_url, status, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [studentId, type, recipient, message, attachmentUrl || null, status, error]
      );
    });

    if (status === "FAILED") {
      throw new Error(error || "Notification failed");
    }

    return { status };
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
