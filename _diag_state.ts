import { prisma } from "@/lib/db/prisma";

async function main() {
  const classId = "3ff5a9c0-c486-422a-9607-a48965b2ab41";
  const student = await prisma.student.findFirst({ where: { fullName: { contains: "Zainabd" } }, select: { id: true, fullName: true } });
  if (!student) { console.log("NO STUDENT"); return; }

  const exams = await prisma.exam.findMany({
    where: { classId, academicYear: 2026 },
    select: { id: true, title: true, examType: true, status: true, totalMarks: true, subjectId: true },
    orderBy: [{ examType: "asc" }, { title: "asc" }],
  });

  const marks = await prisma.mark.findMany({
    where: { studentId: student.id },
    include: { exam: { select: { title: true, examType: true } }, subject: { select: { name: true, totalMarks: true } } },
  });

  const config = await prisma.gradeWeightConfig.findUnique({ where: { classId_academicYear: { classId, academicYear: 2026 } } });

  const rc = await prisma.reportCard.findFirst({ where: { studentId: student.id } });

  console.log(JSON.stringify({ exams, marks, config, reportCard: { percentage: rc?.percentage, grade: rc?.grade, totalMarks: rc?.totalMarks, obtainedMarks: rc?.obtainedMarks } }, null, 2));
}

main().finally(() => prisma.$disconnect());
