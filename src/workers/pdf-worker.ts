import { Worker, Job } from "bullmq";
import { redis } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { generateReportCardPdf } from "@/lib/academic/pdf";
import { generateReportCardsForLockedExam } from "@/lib/academic/report-cards";
import { notifyReportCardsGenerated } from "@/lib/notifications/automation";
import type { PdfJobData } from "@/lib/queue/queues";

type BulkPdfJobData = Partial<PdfJobData> & {
  /** Owning school. Required: the worker has no session to derive it from. */
  tenantId: string;
  examId: string;
  campusId?: string;
};

const worker = new Worker<BulkPdfJobData>(
  "pdf-generation",
  async (job: Job<BulkPdfJobData>) => {
    // A queue job has no session, so the school travels on the job payload.
    return runWithTenantContext({ schoolId: job.data.tenantId }, () => processPdfJob(job));
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

async function processPdfJob(job: Job<BulkPdfJobData>) {
    const { examId, reportCardId } = job.data;

    if (reportCardId) {
      const pdfUrl = await generateReportCardPdf(reportCardId);
      await prisma.reportCard.update({
        where: { id: reportCardId },
        data: { pdfUrl },
      });
      return { generated: 1, reportCardId };
    }

    await generateReportCardsForLockedExam(examId);
    await notifyReportCardsGenerated({ examId });
    const reportCards = await prisma.reportCard.findMany({
      where: { examId },
      select: { id: true },
      orderBy: { rank: "asc" },
    });

    let generated = 0;
    for (const reportCard of reportCards) {
      const pdfUrl = await generateReportCardPdf(reportCard.id);
      await prisma.reportCard.update({
        where: { id: reportCard.id },
        data: { pdfUrl },
      });
      generated += 1;
      await job.updateProgress(Math.round((generated / reportCards.length) * 100));
    }

    return { generated, total: reportCards.length };
}

worker.on("completed", (job) => {
  console.log(`[PDF Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[PDF Worker] Job ${job?.id} failed:`, err);
});

export default worker;
