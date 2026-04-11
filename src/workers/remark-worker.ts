// ===========================================
// SkooleeAI - AI Remark Worker
// ===========================================
// Processes batch AI remark generation jobs.

import { Worker, Job } from "bullmq";
import { redis } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { withTenant, tenantExec } from "@/lib/db/tenant";
import { generateRemark } from "@/lib/ai/openai";
import type { RemarkJobData } from "@/lib/queue/queues";

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
}

interface MarkData {
  subject_name: string;
  marks_obtained: number;
  max_marks: number;
  grade: string;
}

const worker = new Worker<RemarkJobData>(
  "ai-remarks",
  async (job: Job<RemarkJobData>) => {
    const { tenantId, schemaName, studentId, examId, language, tone } = job.data;

    console.log(
      `[Remark Worker] Generating for student ${studentId}, exam ${examId}`
    );

    // Check credits
    const school = await prisma.school.findUnique({
      where: { id: tenantId },
    });
    if (!school || school.aiCreditsUsed >= school.aiCreditsLimit) {
      throw new Error("AI credit limit reached");
    }

    // Fetch student
    const students = await withTenant(schemaName, async (query) => {
      return query<StudentData[]>(
        `SELECT id, first_name, last_name FROM students WHERE id = $1`,
        [studentId]
      );
    });
    const student = Array.isArray(students) ? students[0] : null;
    if (!student) throw new Error(`Student ${studentId} not found`);

    // Fetch marks
    const marks = await withTenant(schemaName, async (query) => {
      return query<MarkData[]>(
        `SELECT sub.name as subject_name, m.marks_obtained, m.max_marks, m.grade
         FROM marks m
         JOIN subjects sub ON sub.id = m.subject_id
         WHERE m.student_id = $1 AND m.exam_id = $2`,
        [studentId, examId]
      );
    });

    if (!Array.isArray(marks) || marks.length === 0) {
      throw new Error("No marks found for student");
    }

    // Generate remark
    const result = await generateRemark({
      studentName: `${student.first_name} ${student.last_name}`,
      className: "Class",
      subjects: marks.map((m) => ({
        name: m.subject_name,
        marksObtained: Number(m.marks_obtained),
        maxMarks: Number(m.max_marks),
        grade: m.grade,
      })),
      language,
      tone,
    });

    // Store overall remark in report_cards
    await withTenant(schemaName, async () => {
      return tenantExec(
        `UPDATE report_cards
         SET overall_remark_en = $1, overall_remark_ur = $2
         WHERE student_id = $3 AND exam_id = $4`,
        [result.remarkEn || null, result.remarkUr || null, studentId, examId]
      );
    });

    // Deduct credit & log
    await prisma.school.update({
      where: { id: tenantId },
      data: { aiCreditsUsed: { increment: 1 } },
    });

    await prisma.aIUsageLog.create({
      data: {
        tenantId,
        action: "batch_remark",
        tokensUsed: result.tokensUsed,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      },
    });

    return { remarkEn: result.remarkEn, remarkUr: result.remarkUr };
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  console.log(`[Remark Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Remark Worker] Job ${job?.id} failed:`, err);
});

export default worker;
