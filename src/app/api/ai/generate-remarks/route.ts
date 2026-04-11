// ─────────────────────────────────────────────────────────────────
// Diagram 3 — AI Remarks Generation
// POST /api/ai/generate-remarks — Generate bilingual remarks per student
// POST /api/ai/generate-remarks/batch — Batch generation for entire exam
// ─────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { batchRemarkSchema, remarkRequestSchema } from "@/lib/validators/schemas";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: call OpenAI to generate a remark
async function generateRemark(
  studentName: string,
  marks: Array<{ subject: string; obtained: number; total: number; grade: string }>,
  language: "en" | "ur" | "both",
  tone: string
): Promise<{ en?: string; ur?: string }> {
  const overall = marks.reduce((a, m) => a + m.obtained, 0);
  const totalMax = marks.reduce((a, m) => a + m.total, 0);
  const pct = Math.round((overall / totalMax) * 100);

  const marksText = marks.map((m) => `${m.subject}: ${m.obtained}/${m.total} (${m.grade})`).join(", ");

  const prompt = language === "ur"
    ? `آپ ایک پاکستانی اسکول کے استاد ہیں۔ طالب علم ${studentName} کے لیے اردو میں ایک مختصر ریمارک لکھیں (2-3 جملے، ${tone} انداز)۔ نتائج: ${marksText}، مجموعی: ${pct}%`
    : language === "both"
      ? `You are a Pakistani school teacher. Write a brief ${tone} remark in English (2-3 sentences) for student ${studentName}. Results: ${marksText}, Overall: ${pct}%. Then on a new line starting with "UR:" write the same in Urdu.`
      : `You are a Pakistani school teacher. Write a brief ${tone} English remark (2-3 sentences) for ${studentName}. Results: ${marksText}, Overall: ${pct}%.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 300,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content || "";

  if (language === "both") {
    const parts = text.split(/^UR:/m);
    return { en: parts[0]?.trim(), ur: parts[1]?.trim() };
  }
  if (language === "ur") return { ur: text.trim() };
  return { en: text.trim() };
}

// ─── Single student remark ────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { batch, ...rest } = body;

  // --- BATCH mode ---
  if (batch) {
    const parsed = batchRemarkSchema.safeParse(rest);
    if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

    const { examId, campusId, language, tone } = parsed.data;

    // Fetch all students in exam
    const marks = await prisma.mark.findMany({
      where: { examId, campusId },
      include: {
        student: true,
        subject: { select: { name: true, totalMarks: true } },
      },
    });

    // Group by student
    const byStudent = marks.reduce((acc, m) => {
      if (!acc[m.studentId]) acc[m.studentId] = { student: m.student, marks: [] };
      acc[m.studentId].marks.push({
        subject: m.subject.name,
        obtained: m.marksObtained,
        total: m.subject.totalMarks,
        grade: m.grade || "",
      });
      return acc;
    }, {} as Record<string, { student: (typeof marks)[0]["student"]; marks: Array<{ subject: string; obtained: number; total: number; grade: string }> }>);

    const results = await Promise.allSettled(
      Object.values(byStudent).map(async ({ student, marks: studentMarks }) => {
        const remarks = await generateRemark(student.fullName, studentMarks, language as "en"|"ur"|"both", tone);
        
        // Save to ReportCard (upsert)
        await prisma.reportCard.upsert({
          where: { studentId_examId: { studentId: student.id, examId } },
          update: { remarksEn: remarks.en, remarksUr: remarks.ur },
          create: {
            campusId,
            studentId: student.id,
            examId,
            remarksEn: remarks.en,
            remarksUr: remarks.ur,
          },
        });

        return { studentId: student.id, ...remarks };
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    return Response.json({ success: true, total: results.length, succeeded });
  }

  // --- SINGLE mode ---
  const parsed = remarkRequestSchema.safeParse(rest);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { studentId, examId, campusId, language, tone } = parsed.data;

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return Response.json({ error: "Student not found" }, { status: 404 });

  const marks = await prisma.mark.findMany({
    where: { studentId, examId },
    include: { subject: { select: { name: true, totalMarks: true } } },
  });

  const marksFormatted = marks.map((m) => ({
    subject: m.subject.name,
    obtained: m.marksObtained,
    total: m.subject.totalMarks,
    grade: m.grade || "",
  }));

  const remarks = await generateRemark(student.fullName, marksFormatted, language as "en"|"ur"|"both", tone);

  await prisma.reportCard.upsert({
    where: { studentId_examId: { studentId, examId } },
    update: { remarksEn: remarks.en, remarksUr: remarks.ur },
    create: {
      campusId,
      studentId,
      examId,
      remarksEn: remarks.en,
      remarksUr: remarks.ur,
    },
  });

  return Response.json({ success: true, remarks });
}
