import { Worker, Job } from "bullmq";
import type { Prisma } from "@prisma/client";
import { redis } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { consumeAICreditAndLog, ensureAICreditsAvailable, generateRemark, getAIModel } from "@/lib/ai/openai";
import { isLockedStatus } from "@/lib/academic/report-cards";
import type { RemarkJobData } from "@/lib/queue/queues";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

const worker = new Worker<RemarkJobData>(
  "ai-remarks",
  async (job: Job<RemarkJobData>) => {
    const { tenantId, userId } = job.data;
    // A queue job has no session, so the school travels on the job payload.
    return runWithTenantContext({ schoolId: tenantId, userId }, () => processRemark(job));
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

async function processRemark(job: Job<RemarkJobData>) {
    const { tenantId, userId, studentId, examId, language, tone } = job.data;

    await ensureAICreditsAvailable(tenantId);

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { class: { select: { name: true, section: true } } },
    });
    if (!exam) throw new Error("Exam not found");
    if (!exam.isLocked && !isLockedStatus(exam.status)) {
      throw new Error("Generate remarks after exam lock");
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.campusId !== exam.campusId) {
      throw new Error(`Student ${studentId} not found`);
    }

    const marks = await prisma.mark.findMany({
      where: { studentId, examId },
      include: { subject: { select: { name: true, totalMarks: true } } },
      orderBy: { subject: { name: "asc" } },
    });

    if (marks.length === 0) throw new Error("No marks found for student");

    const result = await generateRemark({
      studentName: student.fullName,
      className: [exam.class.name, exam.class.section].filter(Boolean).join(" - "),
      subjects: marks.map((mark) => ({
        name: mark.subject.name,
        marksObtained: mark.marksObtained,
        maxMarks: mark.subject.totalMarks,
        grade: mark.grade || "",
      })),
      language,
      tone,
    });

    await consumeAICreditAndLog(
      {
        schoolId: tenantId,
        campusId: exam.campusId,
        userId: userId || null,
        feature: "generate_remarks",
        action: "batch_remark",
        promptVersion: result.promptVersion,
        model: result.model,
        tokensUsed: result.tokensUsed,
        approvalStatus: "PENDING_REVIEW",
        output: jsonValue({ remarkEn: result.remarkEn, remarkUr: result.remarkUr }),
        metadata: jsonValue({ studentId, examId, queueJobId: job.id }),
      },
      async (tx) => {
        const reportCard = await tx.reportCard.upsert({
          where: { studentId_examId: { studentId, examId } },
          update: {
            remarksEn: result.remarkEn,
            remarksUr: result.remarkUr,
            remarksApproved: false,
            approvedBy: null,
            approvedAt: null,
            pdfUrl: null,
            status: "GENERATED",
          },
          create: {
            campusId: exam.campusId,
            studentId,
            examId,
            remarksEn: result.remarkEn,
            remarksUr: result.remarkUr,
            remarksApproved: false,
            status: "GENERATED",
          },
        });

        await tx.aIReviewItem.create({
          data: {
            schoolId: tenantId,
            campusId: exam.campusId,
            userId: userId || null,
            feature: "generate_remarks",
            relatedType: "REPORT_CARD",
            relatedId: reportCard.id,
            title: `${student.fullName} report remark draft`,
            draft: jsonValue({ remarkEn: result.remarkEn, remarkUr: result.remarkUr }),
            status: "PENDING",
            promptVersion: result.promptVersion,
            model: result.model,
            tokensUsed: result.tokensUsed,
          },
        });

        await tx.aIInsight.create({
          data: {
            schoolId: tenantId,
            campusId: exam.campusId,
            userId: userId || "system",
            role: "WORKER",
            feature: "generate_remarks",
            action: "batch_remark",
            title: `${student.fullName} report remark draft`,
            summary: result.remarkEn || result.remarkUr || "Report remark draft generated",
            output: jsonValue({ remarkEn: result.remarkEn, remarkUr: result.remarkUr }),
            promptVersion: result.promptVersion || "phase4-ai-v1",
            model: result.model || getAIModel(),
            tokensUsed: result.tokensUsed,
            approvalStatus: "PENDING_REVIEW",
          },
        });

        return reportCard;
      }
    );

    return { remarkEn: result.remarkEn, remarkUr: result.remarkUr };
}

worker.on("completed", (job) => {
  console.log(`[Remark Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Remark Worker] Job ${job?.id} failed:`, err);
});

export default worker;
