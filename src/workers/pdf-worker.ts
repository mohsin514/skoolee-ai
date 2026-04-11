// ===========================================
// SkooleeAI - PDF Generation Worker
// ===========================================
// Processes bulk PDF generation jobs from BullMQ.
// Fetches student marks, generates PDFs, uploads to S3.

import { Worker, Job } from "bullmq";
import { redis } from "@/lib/queue/connection";
import { prisma } from "@/lib/db/prisma";
import { withTenant, tenantExec } from "@/lib/db/tenant";
import { uploadPdf, reportCardKey, getDownloadUrl } from "@/lib/storage/s3";
import { calculateGrade } from "@/lib/utils";

interface BulkPdfJobData {
  tenantId: string;
  schemaName: string;
  classId: string;
  examId: string;
}

interface StudentResult {
  id: string;
  first_name: string;
  last_name: string;
  registration_no: string;
}

interface MarkResult {
  subject_name: string;
  marks_obtained: number;
  max_marks: number;
  grade: string;
  ai_remark_en: string | null;
  ai_remark_ur: string | null;
}

const worker = new Worker<BulkPdfJobData>(
  "pdf-generation",
  async (job: Job<BulkPdfJobData>) => {
    const { tenantId, schemaName, classId, examId } = job.data;
    console.log(
      `[PDF Worker] Processing job ${job.id} for tenant ${tenantId}`
    );

    // 1. Fetch all students in the class
    const students = await withTenant(schemaName, async (query) => {
      return query<StudentResult[]>(
        `SELECT id, first_name, last_name, registration_no
         FROM students WHERE class_id = $1 AND status = 'ACTIVE'
         ORDER BY first_name ASC`,
        [classId]
      );
    });

    if (!Array.isArray(students) || students.length === 0) {
      console.log(`[PDF Worker] No students found for class ${classId}`);
      return { generated: 0 };
    }

    let generated = 0;

    for (const student of students) {
      try {
        // 2. Fetch marks for this student + exam
        const marks = await withTenant(schemaName, async (query) => {
          return query<MarkResult[]>(
            `SELECT sub.name as subject_name, m.marks_obtained, m.max_marks,
                    m.grade, m.ai_remark_en, m.ai_remark_ur
             FROM marks m
             JOIN subjects sub ON sub.id = m.subject_id
             WHERE m.student_id = $1 AND m.exam_id = $2
             ORDER BY sub.name ASC`,
            [student.id, examId]
          );
        });

        if (!Array.isArray(marks) || marks.length === 0) continue;

        // 3. Calculate totals
        const totalMarks = marks.reduce((sum, m) => sum + Number(m.max_marks), 0);
        const obtainedMarks = marks.reduce(
          (sum, m) => sum + Number(m.marks_obtained),
          0
        );
        const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
        const overallGrade = calculateGrade(percentage);

        // 4. Generate PDF (placeholder — build a real PDF with @react-pdf/renderer)
        const pdfContent = buildPdfText(
          student,
          marks,
          totalMarks,
          obtainedMarks,
          percentage,
          overallGrade
        );
        const pdfBuffer = Buffer.from(pdfContent, "utf-8");

        // 5. Upload to S3
        const key = reportCardKey(tenantId, examId, student.id);
        await uploadPdf(key, pdfBuffer);

        // 6. Create/update report card record
        await withTenant(schemaName, async () => {
          return tenantExec(schemaName, 
            `INSERT INTO report_cards (student_id, exam_id, total_marks, obtained_marks, percentage, grade, pdf_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'GENERATED')
             ON CONFLICT (student_id, exam_id)
             DO UPDATE SET total_marks = $3, obtained_marks = $4, percentage = $5, grade = $6, pdf_url = $7, status = 'GENERATED'`,
            [student.id, examId, totalMarks, obtainedMarks, percentage.toFixed(2), overallGrade, key]
          );
        });

        generated++;
        await job.updateProgress(Math.round((generated / students.length) * 100));
      } catch (err) {
        console.error(
          `[PDF Worker] Failed for student ${student.id}:`,
          err
        );
      }
    }

    console.log(
      `[PDF Worker] Job ${job.id} complete: ${generated}/${students.length} PDFs generated`
    );
    return { generated, total: students.length };
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

// Simple text-based PDF placeholder.
// Replace with @react-pdf/renderer for real production PDFs.
function buildPdfText(
  student: StudentResult,
  marks: MarkResult[],
  totalMarks: number,
  obtainedMarks: number,
  percentage: number,
  grade: string
): string {
  let text = `REPORT CARD\n`;
  text += `${"=".repeat(50)}\n`;
  text += `Student: ${student.first_name} ${student.last_name}\n`;
  text += `Reg No: ${student.registration_no}\n\n`;

  for (const m of marks) {
    text += `${m.subject_name}: ${m.marks_obtained}/${m.max_marks} (${m.grade})\n`;
    if (m.ai_remark_en) text += `  EN: ${m.ai_remark_en}\n`;
    if (m.ai_remark_ur) text += `  UR: ${m.ai_remark_ur}\n`;
  }

  text += `\nTotal: ${obtainedMarks}/${totalMarks}\n`;
  text += `Percentage: ${percentage.toFixed(1)}%\n`;
  text += `Grade: ${grade}\n`;

  return text;
}

worker.on("completed", (job) => {
  console.log(`[PDF Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[PDF Worker] Job ${job?.id} failed:`, err);
});

export default worker;
