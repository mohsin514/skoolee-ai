import { familyVersion, getPublishedVersion } from "@/lib/academic/report-versions";
import { publishedReportsWhere } from "@/lib/auth/policy";
import { errorResponse } from "@/lib/api/scope";
import { getAuthUser } from "@/lib/auth";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { attendanceForYear, summarizeAttendance } from "@/lib/attendance";
import { withParentScope } from "@/lib/parent/resolve-child";
import { attendanceRuleFor } from "@/lib/attendance/rule";
import { studentScope } from "@/lib/auth/policy";
import { loadPermissionMap } from "@/lib/permissions";
import { capabilitiesFor } from "@/lib/navigation/capabilities";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** How many recent invoices travel with the payload for the learner charts. Totals never use this list. */
const RECENT_INVOICES = 5;

/** The registry keys the family console reads (§3 `parent`): the role-matrix modules and the family capability keys. */
const FAMILY_NAV_KEYS = ["reports", "exams", "timetable", "attendance", "fees", "corrections", "pkgCanteen", "accessPlans", "pickupGuardian", "multiChild"] as const;
const NO_FAMILY_ACCESS = Object.fromEntries(FAMILY_NAV_KEYS.map((key) => [key, false])) as Record<(typeof FAMILY_NAV_KEYS)[number], boolean>;

/**
 * Family totals (§11 P7, F19): the outstanding balance per currency across every open invoice of every child the
 * guardian may see finances for — never the short recent list, and never one child only — so Home's figure is the
 * sum of the children's statements.
 */
async function outstandingByCurrency(schoolId: string, students: Prisma.StudentWhereInput) {
  const rows = await prisma.invoice.groupBy({
    by: ["currency"],
    where: { schoolId, student: students, status: { not: "CANCELLED" }, balanceDue: { gt: 0 } },
    _sum: { balanceDue: true },
    _count: { _all: true },
  });
  return rows
    .map((row) => ({ currency: row.currency, outstanding: row._sum.balanceDue ?? 0, invoices: row._count._all }))
    .filter((row) => row.outstanding > 0);
}

export async function GET(req: NextRequest) {
  try {
    // M98 / G4: a signed-in guardian whose children are not linked yet (an invitation still waiting) is not an
    // error. They get the family console with Home only — greeting, the invitations banner and an empty state —
    // instead of "Invalid or expired access" with no way to reach their invitations.
    const session = req.nextUrl.searchParams.get("token") ? null : await getAuthUser();
    if (session?.role === "PARENT" && !req.nextUrl.searchParams.get("studentId")) {
      const linked = await prisma.student.count({ where: studentScope(session, "any") });
      if (linked === 0) {
        return Response.json({ success: true, data: null, noChildren: true, guardian: { fullName: session.fullName ?? null }, navigationAccess: NO_FAMILY_ACCESS });
      }
    }

    return await withParentScope(req, async ({ studentId, children, permissions: relation, schoolId }) => {
    if (!studentId) {
      return Response.json({ error: "Invalid or expired access" }, { status: 401 });
    }

    // Children are only listed for a signed-in guardian (never for a token link), so the session
    // user is read only on that path: it names the guardian in the header and keys the family checks.
    const guardian = children.length && session?.role === "PARENT" ? session : null;

    // G8/G9: one predicate with the rest of the app. A module shows (and its data travels) only when this guardian's
    // relationship to the child allows it AND the school's PARENT permission matrix has the module on — the same
    // matrix `/api/navigation/access` applies to the framed family routes. The family capability keys come from
    // `capabilitiesFor()` (§1.4), so the parent console and the framed routes offer the same More leaves.
    // Presentation and payload trimming only: every family API keeps its own per-request check.
    const matrix = await loadPermissionMap(schoolId, "PARENT");
    const moduleOn = (module: string) => matrix.get(module)?.canView === true;
    const permissions = {
      ...relation,
      learningRecords: relation.learningRecords && moduleOn("reports"),
      attendance: relation.attendance && moduleOn("attendance"),
      finances: relation.finances && moduleOn("fees"),
    };
    const family = guardian ? await capabilitiesFor(guardian, matrix) : null;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { name: true, section: true, academicYear: true } },
        campus: { select: { schoolId: true, name: true, city: true, phone: true, email: true, website: true, principalName: true, board: true, logoUrl: true, school: { select: { name: true, logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true, establishedYear: true } } } },
        // A report card sits in GENERATED/REVIEWED while the office is still
        // checking it. Families only ever see one the school has released.
        ...(permissions.learningRecords ? { reportCards: {
          where: publishedReportsWhere,
          orderBy: { generatedAt: "desc" },
          include: {
            exam: { select: { id: true, title: true, term: true, academicYear: true } },
          },
        } } : {}),
        ...(permissions.attendance ? { attendance: {
          // The class tells us which academic year a day belongs to; without
          // it a promoted child's old year pools into this year's percentage.
          include: { class: { select: { academicYear: true } } },
          orderBy: { date: "desc" },
          take: 200,
        } } : {}),
        ...(permissions.finances ? { invoices: {
          orderBy: { dueDate: "desc" },
          take: RECENT_INVOICES,
        } } : {}),
      },
    });

    if (!student) {
      return Response.json({ error: "Student not found" }, { status: 404 });
    }

    const currentYearAttendance = permissions.attendance ? attendanceForYear(
      student.attendance,
      student.class?.academicYear
    ) : [];
    const attendanceSummary = summarizeAttendance(currentYearAttendance, await attendanceRuleFor(student.schoolId));
    const totalAttendance = attendanceSummary.total;
    const presentCount = attendanceSummary.present;
    const attendanceRate = attendanceSummary.rate;

    const released = permissions.learningRecords
      ? await Promise.all(student.reportCards.map(async r => familyVersion(await getPublishedVersion(r.id))))
      : [];

    // Family totals: every open invoice of every child this guardian may see finances for (statement semantics).
    const feeTotals = !moduleOn("fees") ? []
      : guardian ? await outstandingByCurrency(schoolId, { AND: [studentScope(guardian, "finances"), { archivedAt: null }] })
      : permissions.finances ? await outstandingByCurrency(schoolId, { id: student.id }) : [];

    return Response.json({
      success: true,
      data: {
        // Every child this guardian has at the school, so the portal can offer
        // a switcher instead of stranding siblings behind the default pick.
        children,
        selectedStudentId: studentId,
        // The signed-in guardian, so the header greets the parent rather than the child.
        guardian: guardian ? { fullName: guardian.fullName ?? null } : null,
        access: {
          learningRecords: permissions.learningRecords,
          attendance: permissions.attendance,
          finances: permissions.finances,
          communication: permissions.communication,
          pickup: permissions.pickup,
        },
        // Booleans only: the family console's registry visibility (§3 `parent`) reads these keys.
        navigationAccess: {
          reports: relation.learningRecords && moduleOn("reports"),
          exams: relation.learningRecords && moduleOn("exams"),
          timetable: relation.learningRecords && moduleOn("timetable"),
          attendance: permissions.attendance,
          fees: permissions.finances,
          corrections: family?.corrections ?? false,
          pkgCanteen: family?.pkgCanteen ?? false,
          accessPlans: family?.accessPlans ?? false,
          pickupGuardian: family?.pickupGuardian ?? false,
          multiChild: family?.multiChild ?? false,
        },
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
          pdfUrl: `/api/reports/download?reportCardId=${encodeURIComponent(r.id)}&versionId=${encodeURIComponent(r.versionId)}&redirect=1`,
        })),
        marksByExam: released.map(r => ({ examId: r.examId, examTitle: r.examTitle, term: r.term, marks: r.marks })),
        attendance: permissions.attendance ? {
          rate: attendanceRate,
          total: totalAttendance,
          present: presentCount,
          // `summarizeAttendance` already separates these. Sending only the
          // present count left the portal to infer "absent = total - present",
          // which silently reported approved leave as absence.
          absent: attendanceSummary.absent,
          leave: attendanceSummary.leave,
          late: attendanceSummary.late,
          excused: attendanceSummary.excused,
          counted: attendanceSummary.counted,
          attended: attendanceSummary.attended,
          recent: currentYearAttendance.slice(0, 30).map((a) => ({
            date: a.date.toISOString().split("T")[0],
            status: a.status,
          })),
        } : { rate: null, total: 0, present: 0, absent: 0, leave: 0, late: 0, excused: 0, counted: 0, attended: 0, recent: [] },
        fees: permissions.finances ? student.invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          currency: inv.currency,
          totalAmount: inv.totalAmount,
          paid: inv.totalAmountPaid,
          balance: inv.balanceDue,
          status: inv.status,
          dueDate: inv.dueDate.toISOString().split("T")[0],
        })) : [],
        feeTotals,
      },
    });
    });
  } catch (error) {
    return errorResponse(error, "Failed to load data");
  }
}
