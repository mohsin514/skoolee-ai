import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { verifyParentToken } from "../token/route";

export const runtime = "nodejs";

async function resolveStudentId(req: NextRequest): Promise<string | null> {
  const token = req.nextUrl.searchParams.get("token");
  if (token) {
    const result = await verifyParentToken(token);
    return result?.studentId || null;
  }

  const user = await getAuthUser();
  if (!user) return null;

  if (user.role === "PARENT") {
    const student = await prisma.student.findFirst({
      where: { parentUserId: user.userId },
      select: { id: true },
    });
    return student?.id || null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const studentId = await resolveStudentId(req);
    if (!studentId) {
      return Response.json({ error: "Invalid or expired access" }, { status: 401 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { name: true, section: true, academicYear: true } },
        campus: { select: { name: true, city: true, phone: true, email: true, website: true, principalName: true, board: true, logoUrl: true, school: { select: { name: true, logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true, establishedYear: true } } } },
        reportCards: {
          orderBy: { generatedAt: "desc" },
          include: {
            exam: { select: { id: true, title: true, term: true, academicYear: true } },
          },
        },
        marks: {
          include: {
            subject: { select: { name: true, totalMarks: true } },
            exam: { select: { title: true, term: true } },
          },
        },
        attendance: {
          orderBy: { date: "desc" },
          take: 90,
        },
        invoices: {
          orderBy: { dueDate: "desc" },
          take: 5,
        },
      },
    });

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const totalAttendance = student.attendance.length;
    const presentCount = student.attendance.filter((a) => a.status === "PRESENT").length;
    const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

    const marksByExam = new Map<string, { examTitle: string; term: string; marks: typeof student.marks }>();
    for (const m of student.marks) {
      const key = m.examId;
      if (!marksByExam.has(key)) {
        marksByExam.set(key, { examTitle: m.exam.title, term: m.exam.term, marks: [] });
      }
      marksByExam.get(key)!.marks.push(m);
    }

    return Response.json({
      success: true,
      data: {
        student: {
          fullName: student.fullName,
          rollNo: student.rollNo,
          gender: student.gender,
          profileImageUrl: student.profileImageUrl,
          className: [student.class.name, student.class.section].filter(Boolean).join(" - "),
          academicYear: student.class.academicYear,
        },
        campus: student.campus,
        reportCards: student.reportCards.map((r) => ({
          id: r.id,
          examTitle: r.exam.title,
          term: r.exam.term,
          academicYear: r.exam.academicYear,
          percentage: r.percentage,
          grade: r.grade,
          rank: r.rank,
          obtainedMarks: r.obtainedMarks,
          totalMarks: r.totalMarks,
          remarksEn: r.remarksEn,
          remarksUr: r.remarksUr,
          pdfUrl: r.pdfUrl,
          status: r.status,
        })),
        marksByExam: [...marksByExam.entries()].map(([examId, data]) => ({
          examId,
          examTitle: data.examTitle,
          term: data.term,
          marks: data.marks.map((m) => ({
            subject: m.subject.name,
            obtained: m.marksObtained,
            total: m.subject.totalMarks,
            grade: m.grade,
          })),
        })),
        attendance: {
          rate: attendanceRate,
          total: totalAttendance,
          present: presentCount,
          recent: student.attendance.slice(0, 30).map((a) => ({
            date: a.date.toISOString().split("T")[0],
            status: a.status,
          })),
        },
        fees: student.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          totalAmount: inv.totalAmount,
          paid: inv.totalAmountPaid,
          balance: inv.balanceDue,
          status: inv.status,
          dueDate: inv.dueDate.toISOString().split("T")[0],
        })),
      },
    });
  } catch {
    return Response.json({ error: "Failed to load data" }, { status: 500 });
  }
}
