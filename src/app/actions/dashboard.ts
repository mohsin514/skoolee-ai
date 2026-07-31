'use server'

import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, type AuthUser } from "@/lib/auth";
import { isCampusAdminRole, roleLabel } from "@/lib/roles";
import { assertSchoolOperational } from "@/lib/billing/entitlements";

function requireCampusId(session: AuthUser): string {
  if (!session.campusId) {
    throw new Error("Campus context is required for this dashboard");
  }

  return session.campusId;
}

function aiInsightSelect() {
  return {
    id: true,
    feature: true,
    title: true,
    summary: true,
    approvalStatus: true,
    createdAt: true,
  } as const;
}

function aiReviewSelect() {
  return {
    id: true,
    feature: true,
    title: true,
    status: true,
    createdAt: true,
  } as const;
}

function formatPendingInvite(invite: { id: string; email: string; status: string; expiresAt: Date; role?: unknown }) {
  return {
    inviteId: invite.id,
    email: invite.email,
    role: invite.role,
    status: new Date() > invite.expiresAt ? "Expired" : "Invited",
    expiresAt: invite.expiresAt,
  };
}

export const getSuperAdminDashboardData = cache(async function getSuperAdminDashboardData() {
  const session = await getAuthUser();
  if (!session || session.role !== "SUPER_ADMIN") throw new Error("Permission Denied");
  await assertSchoolOperational(session.schoolId);

  const [
    school,
    campuses,
    aiInsights,
    aiUsageByCampus,
    pendingAIReviewItems,
    communicationSummary,
    invoiceSummary,
  ] = await Promise.all([
    prisma.school.findUnique({ where: { id: session.schoolId } }),
    prisma.campus.findMany({
      where: { schoolId: session.schoolId },
      include: {
        users: {
          where: { role: { in: ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"] }, isActive: true },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            profileImageUrl: true,
            role: true,
            onboardingComplete: true,
            isActive: true,
            _count: { select: { taughtSubjects: true, ledClasses: true } },
          },
          orderBy: { fullName: "asc" },
        },
        staffInvitations: {
          where: { role: { in: ["CAMPUS_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"] }, status: "pending" },
          select: { id: true, email: true, role: true, status: true, expiresAt: true, profile: true },
          orderBy: { createdAt: "desc" },
        },
        classes: {
          select: {
            id: true,
            name: true,
            section: true,
            academicYear: true,
            classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
            _count: { select: { students: true, subjects: true, exams: true } },
          },
          orderBy: [{ academicYear: "desc" }, { name: "asc" }],
        },
        students: {
          select: {
            id: true,
            fullName: true,
            nameUr: true,
            rollNo: true,
            dateOfBirth: true,
            gender: true,
            bloodType: true,
            nationality: true,
            phone: true,
            guardianName: true,
            guardianNameUr: true,
            guardianPhone: true,
            guardianWhatsapp: true,
            guardianEmail: true,
            guardianRelationship: true,
            guardianOccupation: true,
            city: true,
            province: true,
            postalCode: true,
            address: true,
            medicalNotes: true,
            specialNeeds: true,
            allergies: true,
            medications: true,
            previousSchool: true,
            enrollmentDate: true,
            status: true,
            profileImageUrl: true,
            studentUser: { select: { email: true, isActive: true } },
            class: { select: { id: true, name: true, section: true, academicYear: true } },
            reportCards: {
              select: {
                id: true,
                percentage: true,
                grade: true,
                status: true,
                remarksApproved: true,
                deliveryStatus: true,
                isSent: true,
                generatedAt: true,
                exam: { select: { title: true, term: true, status: true } },
              },
              orderBy: { generatedAt: "desc" },
              take: 1,
            },
          },
          orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
        },
        exams: {
          select: {
            id: true,
            title: true,
            term: true,
            academicYear: true,
            status: true,
            isLocked: true,
            reviewedAt: true,
            publishedAt: true,
            class: { select: { name: true, section: true } },
            _count: { select: { reportCards: true } },
          },
          orderBy: [{ academicYear: "desc" }, { title: "asc" }],
          take: 8,
        },
        reportCards: {
          select: {
            id: true,
            percentage: true,
            grade: true,
            status: true,
            remarksApproved: true,
            deliveryStatus: true,
            isSent: true,
            generatedAt: true,
            student: { select: { fullName: true, rollNo: true, class: { select: { name: true, section: true } } } },
            exam: { select: { title: true, term: true, status: true } },
          },
          orderBy: { generatedAt: "desc" },
          take: 8,
        },
        _count: {
          select: {
            users: true,
            classes: true,
            students: true,
            subjects: true,
            exams: true,
            reportCards: true,
            invoices: true,
            parentCommunications: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aIInsight.findMany({
      where: { schoolId: session.schoolId },
      select: aiInsightSelect(),
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.aIUsageLog.groupBy({
      by: ["campusId"],
      where: { schoolId: session.schoolId },
      _count: { _all: true },
      _sum: { tokensUsed: true },
    }),
    prisma.aIReviewItem.findMany({
      where: { schoolId: session.schoolId, status: "PENDING" },
      select: aiReviewSelect(),
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
    prisma.parentCommunication.groupBy({
      by: ["campusId", "status"],
      where: { schoolId: session.schoolId },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: ["campusId", "status"],
      where: { campus: { schoolId: session.schoolId } },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const aiUsageMap = aiUsageByCampus.reduce<Record<string, { runs: number; tokens: number }>>((acc, item) => {
    const key = item.campusId || "school";
    acc[key] = { runs: item._count._all, tokens: item._sum.tokensUsed || 0 };
    return acc;
  }, {});

  const communicationMap = communicationSummary.reduce<Record<string, Record<string, number>>>((acc, item) => {
    const key = item.campusId || "school";
    acc[key] = { ...(acc[key] || {}), [item.status]: item._count._all };
    return acc;
  }, {});

  const invoiceMap = invoiceSummary.reduce<Record<string, Record<string, { count: number; amount: number }>>>((acc, item) => {
    const key = item.campusId || "school";
    acc[key] = {
      ...(acc[key] || {}),
      [item.status]: { count: item._count._all, amount: item._sum.totalAmount || 0 },
    };
    return acc;
  }, {});

  const formattedCampuses = campuses.map((campus) => {
    const admin = campus.users.find((user) => user.role === "CAMPUS_ADMIN" || user.role === "ADMIN");
    const principal = campus.users.find((user) => user.role === "PRINCIPAL");
    const teachers = campus.users.filter((user) => user.role === "TEACHER");
    const pendingAdmin = campus.staffInvitations.find((invite) => invite.role === "CAMPUS_ADMIN" || invite.role === "ADMIN");
    const pendingPrincipal = campus.staffInvitations.find((invite) => invite.role === "PRINCIPAL");
    const pendingTeacherInvitations = campus.staffInvitations.filter((invite) => invite.role === "TEACHER");

    return {
      id: campus.id,
      name: campus.name,
      city: campus.city,
      status: "Active",
      studentCount: campus._count.students,
      classCount: campus._count.classes,
      staffCount: campus._count.users,
      subjectCount: campus._count.subjects,
      examCount: campus._count.exams,
      reportCardCount: campus._count.reportCards,
      invoiceCount: campus._count.invoices,
      communicationCount: campus._count.parentCommunications,
      teachers,
      teacherCount: teachers.length,
      classes: campus.classes,
      students: campus.students,
      recentExams: campus.exams,
      recentReportCards: campus.reportCards,
      pendingInvitations: campus.staffInvitations.map(formatPendingInvite),
      pendingTeacherInvitations: pendingTeacherInvitations.map(formatPendingInvite),
      aiUsage: aiUsageMap[campus.id] || { runs: 0, tokens: 0 },
      communicationSummary: communicationMap[campus.id] || {},
      invoiceSummary: invoiceMap[campus.id] || {},
      admin: admin
        ? { ...admin, status: admin.onboardingComplete ? "Active" : "Onboarding" }
        : pendingAdmin
          ? formatPendingInvite(pendingAdmin)
          : null,
      principal: principal
        ? { ...principal, status: principal.onboardingComplete ? "Active" : "Onboarding" }
        : pendingPrincipal
          ? formatPendingInvite(pendingPrincipal)
          : null,
    };
  });

  const networkSummary = formattedCampuses.reduce(
    (acc, campus) => {
      acc.totalStudents += campus.studentCount;
      acc.totalClasses += campus.classCount;
      acc.totalStaff += campus.staffCount;
      acc.totalTeachers += campus.teacherCount;
      acc.totalSubjects += campus.subjectCount;
      acc.totalExams += campus.examCount;
      acc.totalReportCards += campus.reportCardCount;
      acc.totalAiRuns += campus.aiUsage.runs;
      acc.totalAiTokens += campus.aiUsage.tokens;
      acc.pendingInvites += campus.pendingInvitations.length;
      if (!campus.admin || campus.admin.status === "Invited" || campus.admin.status === "Expired") acc.adminGaps += 1;
      if (!campus.principal || campus.principal.status === "Invited" || campus.principal.status === "Expired") acc.principalGaps += 1;
      acc.sentCommunications += campus.communicationSummary.SENT || 0;
      acc.failedCommunications += (campus.communicationSummary.FAILED || 0) + (campus.communicationSummary.BLOCKED || 0);
      acc.pendingInvoices += campus.invoiceSummary.PENDING?.count || 0;
      acc.partialInvoices += campus.invoiceSummary.PARTIAL?.count || 0;
      acc.paidInvoices += campus.invoiceSummary.PAID?.count || 0;
      return acc;
    },
    {
      totalStudents: 0,
      totalClasses: 0,
      totalStaff: 0,
      totalTeachers: 0,
      totalSubjects: 0,
      totalExams: 0,
      totalReportCards: 0,
      totalAiRuns: 0,
      totalAiTokens: 0,
      pendingInvites: 0,
      adminGaps: 0,
      principalGaps: 0,
      sentCommunications: 0,
      failedCommunications: 0,
      pendingInvoices: 0,
      partialInvoices: 0,
      paidInvoices: 0,
    }
  );

  return {
    schoolName: school?.name || "System",
    schoolSlug: school?.slug || "system",
    billing: {
      plan: school?.plan || "FREE",
      status: school?.status || "TRIAL",
      aiCreditsUsed: school?.aiCreditsUsed || 0,
      aiCreditsLimit: school?.aiCreditsLimit || 100,
    },
    campuses: formattedCampuses,
    networkSummary,
    aiInsights,
    aiUsageByCampus,
    pendingAIReviewItems,
    user: {
      fullName: session.fullName || "Owner",
      email: session.email,
      role: roleLabel(session.role),
    },
  };
});

export const getCampusDashboardData = cache(async function getCampusDashboardData() {
  const session = await getAuthUser();
  if (!session || !isCampusAdminRole(session.role)) throw new Error("Permission Denied");
  await assertSchoolOperational(session.schoolId);

  const campusId = requireCampusId(session);

  const [
    classes,
    teachers,
    campusAdmins,
    principal,
    pendingInvitations,
    school,
    campus,
    campusCount,
    students,
    recentExams,
    recentReportCards,
    studentCount,
    aiInsights,
    pendingAIReviewItems,
    attendanceRecords,
    invoiceTotals,
    invoiceGroups,
  ] = await Promise.all([
    prisma.class.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      include: {
        _count: { select: { students: true, subjects: true } },
        classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
        subjects: {
          select: {
            id: true,
            name: true,
            totalMarks: true,
            teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { campusId, schoolId: session.schoolId, role: "TEACHER", isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        profileImageUrl: true,
        isActive: true,
        onboardingComplete: true,
        cnic: true,
        dateOfBirth: true,
        gender: true,
        qualification: true,
        specialization: true,
        experience: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        joiningDate: true,
        emergencyContact: true,
        emergencyPhone: true,
        taughtSubjects: {
          select: {
            id: true,
            name: true,
            totalMarks: true,
            class: { select: { id: true, name: true, section: true, academicYear: true } },
          },
          orderBy: { name: "asc" },
        },
        ledClasses: {
          select: {
            id: true,
            name: true,
            section: true,
            academicYear: true,
            _count: { select: { students: true, subjects: true } },
          },
          orderBy: [{ academicYear: "desc" }, { name: "asc" }],
        },
        _count: { select: { taughtSubjects: true, ledClasses: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { campusId, schoolId: session.schoolId, role: { in: ["CAMPUS_ADMIN", "ADMIN"] }, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        profileImageUrl: true,
        isActive: true,
        onboardingComplete: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findFirst({
      where: { campusId, schoolId: session.schoolId, role: "PRINCIPAL", isActive: true },
      select: { id: true, fullName: true, email: true, profileImageUrl: true, onboardingComplete: true, isActive: true },
    }),
    prisma.staffInvitation.findMany({
      where: {
        campusId,
        status: "pending",
        role: { in: ["CAMPUS_ADMIN", "ADMIN", "TEACHER", "PRINCIPAL"] },
        campus: { schoolId: session.schoolId },
      },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true, profile: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.school.findUnique({ where: { id: session.schoolId } }),
    prisma.campus.findFirst({ where: { id: campusId, schoolId: session.schoolId } }),
    prisma.campus.count({ where: { schoolId: session.schoolId } }),
    prisma.student.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      select: {
        id: true,
        fullName: true,
        nameUr: true,
        rollNo: true,
        dateOfBirth: true,
        gender: true,
        bloodType: true,
        nationality: true,
        phone: true,
        guardianName: true,
        guardianNameUr: true,
        guardianPhone: true,
        guardianWhatsapp: true,
        guardianEmail: true,
        guardianRelationship: true,
        guardianOccupation: true,
        city: true,
        province: true,
        postalCode: true,
        address: true,
        medicalNotes: true,
        specialNeeds: true,
        allergies: true,
        medications: true,
        previousSchool: true,
        enrollmentDate: true,
        status: true,
        profileImageUrl: true,
        studentUser: { select: { email: true, isActive: true } },
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        attendance: {
          select: { id: true, status: true, date: true },
          orderBy: { date: "desc" },
        },
        reportCards: {
          select: {
            id: true,
            percentage: true,
            grade: true,
            status: true,
            deliveryStatus: true,
            generatedAt: true,
            exam: { select: { title: true, term: true, status: true } },
          },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
    }),
    prisma.exam.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      select: {
        id: true,
        title: true,
        term: true,
        academicYear: true,
        status: true,
        isLocked: true,
        reviewedAt: true,
        publishedAt: true,
        class: { select: { name: true, section: true } },
        _count: { select: { reportCards: true } },
      },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
    }),
    prisma.reportCard.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      select: {
        id: true,
        percentage: true,
        grade: true,
        status: true,
        deliveryStatus: true,
        isSent: true,
        generatedAt: true,
        student: {
          select: {
            fullName: true,
            rollNo: true,
            class: { select: { name: true, section: true } },
          },
        },
        exam: { select: { title: true, term: true, status: true } },
      },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.student.count({ where: { campusId, campus: { schoolId: session.schoolId } } }),
    prisma.aIInsight.findMany({
      where: { schoolId: session.schoolId, campusId },
      select: aiInsightSelect(),
      orderBy: { createdAt: "desc" },
    }),
    prisma.aIReviewItem.findMany({
      where: { schoolId: session.schoolId, campusId, status: "PENDING" },
      select: aiReviewSelect(),
      orderBy: { createdAt: "asc" },
    }),
    prisma.attendance.findMany({
      where: { campusId, date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      select: {
        id: true,
        studentId: true,
        status: true,
        student: { select: { fullName: true, rollNo: true, classId: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: { campusId, campus: { schoolId: session.schoolId } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { campusId, campus: { schoolId: session.schoolId } },
      _count: true,
      _sum: { totalAmount: true },
    }),
  ]);

  const pendingAdmin = pendingInvitations.find((invite) => invite.role === "CAMPUS_ADMIN" || invite.role === "ADMIN");
  const pendingPrincipal = pendingInvitations.find((invite) => invite.role === "PRINCIPAL");

  return {
    schoolName: school?.name || "Institution",
    campusName: campus?.name || "Campus",
    campusCity: campus?.city || "",
    campusRegId: campus?.regId || "",
    isStandaloneCampus: campusCount === 1,
    currentUserId: session.userId,
    canInviteAdmins: campusCount === 1,
    classes,
    teachers,
    campusAdmins,
    campusAdmin: campusAdmins[0] || (pendingAdmin ? formatPendingInvite(pendingAdmin) : null),
    principal: principal || (pendingPrincipal ? formatPendingInvite(pendingPrincipal) : null),
    pendingAdminInvitations: pendingInvitations.filter((invite) => invite.role === "CAMPUS_ADMIN" || invite.role === "ADMIN"),
    pendingTeacherInvitations: pendingInvitations.filter((invite) => invite.role === "TEACHER"),
    pendingInvitations: pendingInvitations.map(formatPendingInvite),
    pendingInviteCount: pendingInvitations.length,
    students,
    recentExams,
    recentReportCards,
    studentCount,
    aiInsights,
    pendingAIReviewItems,
    attendanceRecords,
    attendanceSummary: {
      present: attendanceRecords.filter((r: any) => r.status === "PRESENT").length,
      absent: attendanceRecords.filter((r: any) => r.status === "ABSENT").length,
      leave: attendanceRecords.filter((r: any) => r.status === "LEAVE").length,
    },
    invoiceSummary: {
      total: invoiceTotals._count || 0,
      totalAmount: invoiceTotals._sum?.totalAmount || 0,
      byStatus: invoiceGroups,
    },
    adminName: session.fullName || "Administrator",
    adminEmail: session.email,
    roleLabel: roleLabel(session.role),
  };
});

export const getTeacherDashboardData = cache(async function getTeacherDashboardData() {
  const session = await getAuthUser();
  if (!session || session.role !== "TEACHER") throw new Error("Unauthorized");
  await assertSchoolOperational(session.schoolId);

  const campusId = requireCampusId(session);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [subjects, ledClasses, aiInsights] = await Promise.all([
    prisma.subject.findMany({
      where: { campusId, teacherId: session.userId, campus: { schoolId: session.schoolId } },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        _count: { select: { marks: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.class.findMany({
      where: { campusId, classTeacherId: session.userId, campus: { schoolId: session.schoolId } },
      include: {
        _count: { select: { students: true, subjects: true } },
        subjects: {
          select: {
            id: true,
            name: true,
            totalMarks: true,
            teacherId: true,
            teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }],
    }),
    prisma.aIInsight.findMany({
      where: { schoolId: session.schoolId, campusId, userId: session.userId },
      select: aiInsightSelect(),
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const classIds = [...new Set([...subjects.map((subject) => subject.classId), ...ledClasses.map((cls) => cls.id)])];
  const subjectIds = subjects.map((subject) => subject.id);

  const [students, exams, attendanceToday, recentReportCards] = classIds.length
    ? await Promise.all([
        prisma.student.findMany({
          where: { campusId, classId: { in: classIds }, campus: { schoolId: session.schoolId } },
          select: {
            id: true,
            fullName: true,
            nameUr: true,
            rollNo: true,
            dateOfBirth: true,
            gender: true,
            bloodType: true,
            nationality: true,
            phone: true,
            profileImageUrl: true,
            guardianName: true,
            guardianNameUr: true,
            guardianPhone: true,
            guardianWhatsapp: true,
            guardianEmail: true,
            guardianRelationship: true,
            guardianOccupation: true,
            city: true,
            province: true,
            postalCode: true,
            address: true,
            medicalNotes: true,
            specialNeeds: true,
            allergies: true,
            medications: true,
            previousSchool: true,
            enrollmentDate: true,
            status: true,
            studentUser: { select: { email: true, isActive: true } },
            classId: true,
            class: { select: { id: true, name: true, section: true } },
            reportCards: {
              select: {
                id: true,
                percentage: true,
                grade: true,
                status: true,
                deliveryStatus: true,
                generatedAt: true,
                exam: { select: { title: true, term: true, status: true } },
              },
              orderBy: { generatedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { rollNo: "asc" },
        }),
        prisma.exam.findMany({
          where: {
            campusId,
            classId: { in: classIds },
            campus: { schoolId: session.schoolId },
          },
          include: {
            class: {
              select: {
                id: true,
                name: true,
                section: true,
                _count: { select: { students: true } },
                subjects: {
                  select: { id: true, name: true, totalMarks: true, teacherId: true },
                  orderBy: { name: "asc" },
                },
              },
            },
            subject: { select: { id: true, name: true } },
            marks: {
              select: { id: true, studentId: true, subjectId: true },
            },
            _count: { select: { reportCards: true } },
          },
          orderBy: [{ academicYear: "desc" }, { title: "asc" }],
          take: 24,
        }),
        prisma.attendance.findMany({
          where: { campusId, date: today, student: { classId: { in: classIds } } },
          select: { id: true, studentId: true, status: true, student: { select: { classId: true } } },
        }),
        prisma.reportCard.findMany({
          where: { campusId, student: { classId: { in: classIds } }, campus: { schoolId: session.schoolId } },
          include: {
            student: { select: { id: true, fullName: true, rollNo: true, class: { select: { id: true, name: true, section: true } } } },
            exam: { select: { id: true, title: true, term: true, status: true } },
          },
          orderBy: { generatedAt: "desc" },
          take: 18,
        }),
      ])
    : [[], [], [], []];

  const ledClassIds = new Set(ledClasses.map((cls) => cls.id));
  const assignedSubjectIds = new Set(subjectIds);
  const classHubsMap = new Map<string, any>();

  for (const subject of subjects) {
    if (subject.class) {
      const existing = classHubsMap.get(subject.class.id) || {
        ...subject.class,
        role: ledClassIds.has(subject.class.id) ? "Class teacher" : "Subject teacher",
        subjects: [],
        _count: { students: students.filter((student) => student.class?.id === subject.class.id).length, subjects: 0 },
      };
      existing.subjects.push(subject);
      existing._count.subjects = existing.subjects.length;
      classHubsMap.set(subject.class.id, existing);
    }
  }

  for (const cls of ledClasses) {
    const existing = classHubsMap.get(cls.id) || { ...cls, role: "Class teacher" };
    existing.role = "Class teacher";
    existing.subjects = cls.subjects || existing.subjects || [];
    existing._count = cls._count || existing._count;
    classHubsMap.set(cls.id, existing);
  }

  const classHubs = [...classHubsMap.values()].sort(
    (a, b) =>
      (Number(b.academicYear) || 0) - (Number(a.academicYear) || 0) ||
      String(a.name || "").localeCompare(String(b.name || "")) ||
      String(a.section || "").localeCompare(String(b.section || ""))
  );

  const studentsByClass = students.reduce<Record<string, number>>((acc, student) => {
    const key = student.class?.id || "";
    if (key) acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const examSummaries = exams.map((exam) => {
    // If exam is for a single subject, restrict to that subject only
    const classSubjects = exam.class.subjects;
    const relevantClassSubjects = exam.subjectId
      ? classSubjects.filter((s) => s.id === exam.subjectId)
      : classSubjects;

    const editableSubjects = relevantClassSubjects.filter((subject) =>
      subject.teacherId === session.userId || ledClassIds.has(exam.class.id)
    );
    const editableSubjectIds = new Set(editableSubjects.map((subject) => subject.id));
    const relevantMarks = exam.marks.filter((mark) => editableSubjectIds.has(mark.subjectId));
    const studentCount = studentsByClass[exam.class.id] || exam.class._count.students || 0;
    const expectedMarks = studentCount * editableSubjects.length;

    return {
      id: exam.id,
      title: exam.title,
      term: exam.term,
      academicYear: exam.academicYear,
      status: exam.status,
      isLocked: exam.isLocked,
      classId: exam.classId,
      class: exam.class,
      subject: exam.subject || null,
      subjectId: exam.subjectId,
      editableSubjects,
      enteredMarks: relevantMarks.length,
      expectedMarks,
      missingMarks: Math.max(expectedMarks - relevantMarks.length, 0),
      reportCards: exam._count.reportCards,
    };
  });

  const attendanceSummary = {
    total: students.length,
    present: attendanceToday.filter((entry) => entry.status === "PRESENT").length,
    absent: attendanceToday.filter((entry) => entry.status === "ABSENT").length,
    leave: attendanceToday.filter((entry) => entry.status === "LEAVE").length,
    unmarked: Math.max(students.length - attendanceToday.length, 0),
  };

  return {
    teacherName: session.fullName || "Teacher",
    subjects,
    ledClasses,
    classHubs,
    students,
    exams: examSummaries,
    lockedExams: examSummaries.filter((exam) => exam.isLocked || ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"].includes(exam.status || "")),
    activeExams: examSummaries.filter((exam) => ["ACTIVE", "MARKS_ENTRY"].includes(exam.status || "")),
    attendanceSummary,
    recentReportCards,
    totalStudents: students.length,
    aiInsights,
  };
});

export const getPrincipalDashboardData = cache(async function getPrincipalDashboardData() {
  const session = await getAuthUser();
  if (!session || session.role !== "PRINCIPAL") throw new Error("Unauthorized");
  await assertSchoolOperational(session.schoolId);

  const campusId = requireCampusId(session);

  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const [
    campus,
    totalStudents,
    totalTeachers,
    totalClasses,
    activeExams,
    lockedExams,
    pendingRemarkReviews,
    pendingAIReviews,
    pendingAIReviewItems,
    classes,
    students,
    teachers,
    campusAdmins,
    reviewExams,
    recentReportCards,
    communicationSummary,
    recentCommunications,
    aiInsights,
    markAverage,
    attendanceRecords,
    invoiceTotals,
    invoiceGroups,
    pendingInvitations,
    campusCount,
  ] = await Promise.all([
    prisma.campus.findFirst({ where: { id: campusId, schoolId: session.schoolId }, include: { school: true } }),
    prisma.student.count({ where: { campusId, campus: { schoolId: session.schoolId } } }),
    prisma.user.count({ where: { campusId, schoolId: session.schoolId, role: "TEACHER", isActive: true } }),
    prisma.class.count({ where: { campusId, campus: { schoolId: session.schoolId } } }),
    prisma.exam.count({ where: { campusId, campus: { schoolId: session.schoolId } } }),
    prisma.exam.count({ where: { campusId, campus: { schoolId: session.schoolId }, isLocked: true } }),
    prisma.reportCard.count({
      where: {
        campusId,
        campus: { schoolId: session.schoolId },
        OR: [
          { remarksApproved: false },
          { remarksEn: null, remarksUr: null },
        ],
      },
    }),
    prisma.aIReviewItem.count({
      where: { schoolId: session.schoolId, campusId, status: "PENDING" },
    }),
    prisma.aIReviewItem.findMany({
      where: { schoolId: session.schoolId, campusId, status: "PENDING" },
      select: aiReviewSelect(),
      orderBy: { createdAt: "asc" },
    }),
    prisma.class.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      include: {
        classTeacher: { select: { id: true, fullName: true, email: true, phone: true, profileImageUrl: true } },
        subjects: {
          select: {
            id: true,
            name: true,
            totalMarks: true,
            teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
          },
          orderBy: { name: "asc" },
        },
        students: {
          select: {
            id: true,
            fullName: true,
            rollNo: true,
            gender: true,
            guardianName: true,
            guardianPhone: true,
            guardianWhatsapp: true,
            guardianEmail: true,
            profileImageUrl: true,
            parent: { select: { fullName: true, email: true, phone: true, profileImageUrl: true } },
            reportCards: {
              select: {
                id: true,
                totalMarks: true,
                obtainedMarks: true,
                percentage: true,
                grade: true,
                status: true,
                remarksApproved: true,
                deliveryStatus: true,
                isSent: true,
                pdfUrl: true,
                generatedAt: true,
                exam: { select: { id: true, title: true, term: true, status: true } },
              },
              orderBy: { generatedAt: "desc" },
            },
          },
          orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
        },
        exams: {
          select: {
            id: true,
            title: true,
            term: true,
            academicYear: true,
            status: true,
            isLocked: true,
            reviewedAt: true,
            publishedAt: true,
            _count: { select: { reportCards: true } },
          },
          orderBy: [{ academicYear: "desc" }, { title: "asc" }],
        },
        _count: { select: { students: true, subjects: true } },
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
    }),
    prisma.student.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      select: {
        id: true,
        fullName: true,
        rollNo: true,
        guardianName: true,
        guardianPhone: true,
        guardianWhatsapp: true,
        guardianEmail: true,
        profileImageUrl: true,
        parent: { select: { fullName: true, email: true, phone: true, profileImageUrl: true } },
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        attendance: {
          select: { id: true, status: true, date: true },
          orderBy: { date: "desc" },
        },
        reportCards: {
          select: {
            id: true,
            percentage: true,
            grade: true,
            status: true,
            remarksApproved: true,
            deliveryStatus: true,
            isSent: true,
            generatedAt: true,
            exam: { select: { title: true, term: true, status: true } },
          },
          orderBy: { generatedAt: "desc" },
        },
      },
      orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
    }),
    prisma.user.findMany({
      where: { campusId, schoolId: session.schoolId, role: "TEACHER", isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        profileImageUrl: true,
        isActive: true,
        onboardingComplete: true,
        cnic: true,
        dateOfBirth: true,
        gender: true,
        qualification: true,
        specialization: true,
        experience: true,
        address: true,
        city: true,
        province: true,
        postalCode: true,
        joiningDate: true,
        emergencyContact: true,
        emergencyPhone: true,
        taughtSubjects: {
          select: {
            id: true,
            name: true,
            class: { select: { name: true, section: true, academicYear: true } },
          },
          orderBy: { name: "asc" },
        },
        ledClasses: {
          select: {
            id: true,
            name: true,
            section: true,
            academicYear: true,
            _count: { select: { students: true, subjects: true } },
          },
          orderBy: [{ academicYear: "desc" }, { name: "asc" }],
        },
        _count: { select: { taughtSubjects: true, ledClasses: true } },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.user.findMany({
      where: { campusId, schoolId: session.schoolId, role: { in: ["CAMPUS_ADMIN", "ADMIN"] }, isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        profileImageUrl: true,
        onboardingComplete: true,
        createdAt: true,
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.exam.findMany({
      where: {
        campusId,
        campus: { schoolId: session.schoolId },
        OR: [
          { isLocked: true },
          { status: { in: ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"] } },
        ],
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        _count: { select: { reportCards: true } },
      },
      orderBy: [{ academicYear: "desc" }, { title: "asc" }],
    }),
    prisma.reportCard.findMany({
      where: { campusId, campus: { schoolId: session.schoolId } },
      include: {
        student: {
          select: {
            fullName: true,
            rollNo: true,
            guardianWhatsapp: true,
            guardianEmail: true,
            guardianName: true,
            profileImageUrl: true,
            class: { select: { name: true, section: true } },
          },
        },
        exam: { select: { id: true, title: true, term: true, status: true } },
      },
      orderBy: { generatedAt: "desc" },
    }),
    prisma.parentCommunication.groupBy({
      by: ["status"],
      where: { schoolId: session.schoolId, campusId },
      _count: { _all: true },
    }),
    prisma.parentCommunication.findMany({
      where: { schoolId: session.schoolId, campusId },
      include: {
        student: {
          select: {
            fullName: true,
            rollNo: true,
            profileImageUrl: true,
            class: { select: { name: true, section: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.aIInsight.findMany({
      where: { schoolId: session.schoolId, campusId },
      select: aiInsightSelect(),
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.mark.aggregate({
      where: { campusId, campus: { schoolId: session.schoolId } },
      _avg: { marksObtained: true },
    }),
    prisma.attendance.findMany({
      where: { campusId, date: { gte: today } },
      select: {
        id: true,
        studentId: true,
        status: true,
        student: { select: { fullName: true, rollNo: true, classId: true } },
      },
    }),
    prisma.invoice.aggregate({
      where: { campusId, campus: { schoolId: session.schoolId } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { campusId, campus: { schoolId: session.schoolId } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.staffInvitation.findMany({
      where: {
        campusId,
        status: "pending",
        role: { in: ["CAMPUS_ADMIN", "ADMIN", "TEACHER", "PRINCIPAL"] },
        campus: { schoolId: session.schoolId },
      },
      select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true, profile: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.campus.count({ where: { schoolId: session.schoolId } }),
  ]);

  return {
    principalName: session.fullName || "Principal",
    campusName: campus?.name || "Campus",
    campusCity: campus?.city || "",
    campusRegId: campus?.regId || "",
    schoolName: campus?.school.name || "Institution",
    currentUserId: session.userId,
    campusId,
    totalStudents,
    totalTeachers,
    totalClasses,
    activeExams,
    lockedExams,
    pendingRemarkReviews,
    pendingAIReviews,
    pendingAIReviewItems,
    classes,
    students,
    teachers,
    campusAdmins,
    reviewExams,
    recentExams: reviewExams,
    recentReportCards,
    averageMarks: Math.round(markAverage._avg.marksObtained || 0),
    communicationSummary: communicationSummary.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {}),
    recentCommunications,
    aiInsights,
    attendanceRecords,
    attendanceSummary: {
      present: attendanceRecords.filter((r: any) => r.status === "PRESENT").length,
      absent: attendanceRecords.filter((r: any) => r.status === "ABSENT").length,
      leave: attendanceRecords.filter((r: any) => r.status === "LEAVE").length,
    },
    invoiceSummary: {
      total: invoiceTotals._count || 0,
      totalAmount: invoiceTotals._sum?.totalAmount || 0,
      byStatus: invoiceGroups,
    },
    pendingInvitations: pendingInvitations.map(formatPendingInvite),
    pendingInviteCount: pendingInvitations.length,
    pendingAdminInvitations: pendingInvitations.filter((invite) => invite.role === "CAMPUS_ADMIN" || invite.role === "ADMIN"),
    pendingTeacherInvitations: pendingInvitations.filter((invite) => invite.role === "TEACHER"),
    isStandaloneCampus: campusCount === 1,
    canInviteAdmins: campusCount === 1,
    adminName: session.fullName || "Principal",
    adminEmail: session.email,
    roleLabel: "Principal",
  };
});

export const getStudentDashboardData = cache(async function getStudentDashboardData() {
  const session = await getAuthUser();
  if (!session || (session.role !== "STUDENT" && session.role !== "PARENT")) {
    throw new Error("Unauthorized");
  }
  await assertSchoolOperational(session.schoolId);

  const account = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, fullName: true, email: true, campusId: true, profileImageUrl: true },
  });

  const accountEmail = (account?.email || session.email || "").toLowerCase();
  const identityFilters: any[] = [
    ...(session.role === "PARENT" ? [{ parentUserId: session.userId }] : []),
    ...(session.role === "PARENT" && accountEmail ? [{ guardianEmail: { equals: accountEmail, mode: "insensitive" as const } }] : []),
    ...(account?.fullName ? [{ fullName: account.fullName }] : []),
    ...(session.fullName ? [{ fullName: session.fullName }] : []),
  ];

  const studentInclude = {
      campus: { select: { id: true, name: true, city: true } },
      class: {
        select: {
          id: true,
          name: true,
          section: true,
          academicYear: true,
          classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
          subjects: {
            select: {
              id: true,
              name: true,
              totalMarks: true,
              teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
            },
            orderBy: { name: "asc" },
          },
        },
      },
      marks: {
        include: {
          subject: {
            select: {
              id: true,
              name: true,
              totalMarks: true,
              teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
            },
          },
          exam: { select: { id: true, title: true, term: true, status: true, academicYear: true } },
          enterer: { select: { fullName: true } },
        },
      },
      attendance: {
        include: { marker: { select: { fullName: true } } },
        orderBy: { date: "desc" },
        take: 60,
      },
      reportCards: {
        include: { exam: { select: { id: true, title: true, term: true, status: true, academicYear: true } } },
        orderBy: { generatedAt: "desc" },
        take: 3,
      },
      invoices: {
        include: { payments: { select: { amount: true } } },
        orderBy: { generatedAt: "desc" },
        take: 5,
      },
  } as const;

  const baseStudentWhere = {
    campus: { schoolId: session.schoolId },
    ...(session.campusId ? { campusId: session.campusId } : {}),
  };

  const linkedStudent = session.role === "STUDENT"
    ? await prisma.student.findFirst({
        where: { ...baseStudentWhere, studentUserId: session.userId },
        include: studentInclude,
      })
    : null;

  const student = linkedStudent || await prisma.student.findFirst({
    where: {
      ...baseStudentWhere,
      OR: identityFilters.length ? identityFilters : [{ id: "__missing_student__" }],
    },
    include: studentInclude,
  });

  const attendanceTotal = student?.attendance.length || 0;
  const attendancePresent = student?.attendance.filter((entry) => entry.status === "PRESENT").length || 0;
  const attendanceRate = attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 100) : null;
  const balanceDue = student?.invoices.reduce((total, invoice) => {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    return total + Math.max(invoice.totalAmount - paid, 0);
  }, 0) || 0;
  const aiInsights = await prisma.aIInsight.findMany({
    where: {
      schoolId: session.schoolId,
      userId: session.userId,
      ...(student?.campusId ? { campusId: student.campusId } : {}),
    },
    select: aiInsightSelect(),
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return {
    profileMissing: !student,
    user: {
      id: student?.id || account?.id || session.userId,
      fullName: student?.fullName || account?.fullName || "Student",
      email: account?.email || session.email,
      profileImageUrl: student?.profileImageUrl || account?.profileImageUrl || "",
      rollNo: student?.rollNo || "",
      campusName: student?.campus?.name || "Campus",
      campusCity: student?.campus?.city || "",
      classId: student?.class?.id || "",
      className: student?.class
        ? `${student.class.name}${student.class.section ? ` ${student.class.section}` : ""}`
        : "Unassigned",
      classTeacher: student?.class?.classTeacher || null,
      subjects: student?.class?.subjects || [],
      marks: student?.marks || [],
      attendance: student?.attendance || [],
      reportCards: student?.reportCards || [],
      invoices: student?.invoices || [],
      attendanceRate,
      balanceDue,
      aiInsights,
    },
  };
});
