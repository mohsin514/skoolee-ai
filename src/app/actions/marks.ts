'use server'

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { z } from "zod";

const MarksSchema = z.object({
  student_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  exam_id: z.string().uuid(),
  marks_obtained: z.number().int().min(0), // Max limit verified dynamically
});

export async function saveMarks(data: z.infer<typeof MarksSchema>) {
  // Layer 2: Server action re-verification
  const session = await getAuthUser();
  if (!session || session.role !== 'TEACHER') {
    throw new Error('403 Forbidden');
  }

  const valid = MarksSchema.parse(data);

  // Ownership + campus check
  const subject = await prisma.subject.findFirst({
    where: { 
      id: valid.subject_id, 
      teacherId: session.userId,
      campusId: session.campusId || "", 
    } 
  });

  if (!subject) throw new Error('403 Forbidden - Subject access denied');

  if (valid.marks_obtained > subject.totalMarks) {
      throw new Error(`Marks cannot exceed total marks of ${subject.totalMarks}`);
  }

  // Lock check
  const exam = await prisma.exam.findFirst({
    where: { 
      id: valid.exam_id, 
      isLocked: false 
    } 
  });

  if (!exam) throw new Error('Exam is locked');

  // Find existing mark for audit
  const existingMark = await prisma.mark.findUnique({
    where: {
      examId_studentId_subjectId: {
        examId: valid.exam_id,
        studentId: valid.student_id,
        subjectId: valid.subject_id,
      }
    }
  });

  // Write mark
  const newMark = await prisma.mark.upsert({
    where: {
      examId_studentId_subjectId: {
        examId: valid.exam_id,
        studentId: valid.student_id,
        subjectId: valid.subject_id,
      }
    },
    update: {
      marksObtained: valid.marks_obtained,
      enteredBy: session.userId,
    },
    create: {
      campusId: session.campusId || "",
      examId: valid.exam_id,
      studentId: valid.student_id,
      subjectId: valid.subject_id,
      marksObtained: valid.marks_obtained,
      enteredBy: session.userId,
    }
  });

  // Immutable audit log (Layer 5)
  await prisma.auditLog.create({
    data: {
      tableName: 'marks',
      recordId: newMark.id,
      oldValue: existingMark ? { marksObtained: existingMark.marksObtained } : undefined,
      newValue: { marksObtained: valid.marks_obtained },
      userId: session.userId,
    }
  });

  return { success: true, mark: newMark };
}
