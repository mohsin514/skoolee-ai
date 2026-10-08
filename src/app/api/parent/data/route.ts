import { familyVersion, getPublishedVersion } from "@/lib/academic/report-versions";
import { publishedReportsWhere } from "@/lib/auth/policy";
import { errorResponse } from "@/lib/api/scope";
import { loadPermissionMap } from "@/lib/permissions";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { attendanceForYear, summarizeAttendance } from "@/lib/attendance";
import { withParentScope } from "@/lib/parent/resolve-child";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return await withParentScope(req, async ({ studentId, children }) => {
    if (!studentId) {
      return Response.json({ error: "Invalid or expired access" }, { status: 401 });
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { name: true, section: true, academicYear: true } },
        campus: { select: { schoolId: true, name: true, city: true, phone: true, email: true, website: true, principalName: true, board: true, logoUrl: true, school: { select: { name: true, logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true, establishedYear: true } } } },
        // A report card sits in GENERATED/REVIEWED while the office is still
        // checking it. Families only ever see one the school has released.
        reportCards: {
          where: publishedReportsWhere,
          orderBy: { generatedAt: "desc" },
          include: {
            exam: { select: { id: true, title: true, term: true, academicYear: true } },
          },
        },
        attendance: {
          // The class tells us which academic year a day belongs to; without
          // it a promoted child's old year pools into this year's percentage.
          include: { class: { select: { academicYear: true } } },
          orderBy: { date: "desc" },
          take: 200,
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

    const navigationPermissions = await loadPermissionMap(student.campus.schoolId, "PARENT");

    const currentYearAttendance = attendanceForYear(
      student.attendance,
      student.class?.academicYear
    );
    const attendanceSummary = summarizeAttendance(currentYearAttendance);
    const totalAttendance = attendanceSummary.total;
    const presentCount = attendanceSummary.present;
    const attendanceRate = attendanceSummary.rate;

    const released = await Promise.all(student.reportCards.map(async r => familyVersion(await getPublishedVersion(r.id))));

    return Response.json({
      success: true,
      data: {
        // Every child this guardian has at the school, so the portal can offer
        // a switcher instead of stranding siblings behind the default pick.
        children,
        selectedStudentId: studentId,
        navigationAccess: Object.fromEntries([...navigationPermissions].map(([module, flags]) => [module, flags.canView])),
        student: {
          fullName: student.fullName,
          rollNo: student.rollNo,
          gender: student.gender,
          profileImageUrl: student.profileImageUrl,
          className: [student.class.name, student.class.section].filter(Boolean).join(" - "),
          academicYear: student.class.academicYear,
        },
        campus: { ...student.campus, schoolId: undefined },
        reportCards: released.map(r => ({ ...r,
          pdfUrl: `/api/reports/download?reportCardId=${r.id}&versionId=${r.versionId}&redirect=1${req.nextUrl.searchParams.get("token") ? `&token=${encodeURIComponent(req.nextUrl.searchParams.get("token")!)}` : ""}`,
        })),
        marksByExam: released.map(r => ({ examId: r.examId, examTitle: r.examTitle, term: r.term, marks: r.marks })),
        attendance: {
          rate: attendanceRate,
          total: totalAttendance,
          present: presentCount,
          // `summarizeAttendance` already separates these. Sending only the
          // present count left the portal to infer "absent = total - present",
          // which silently reported approved leave as absence.
          absent: attendanceSummary.absent,
          leave: attendanceSummary.leave,
          recent: currentYearAttendance.slice(0, 30).map((a) => ({
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
    });
  } catch (error) {
    return errorResponse(error, "Failed to load data");
  }
}
