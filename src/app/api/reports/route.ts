import { loadPermissionMap } from "@/lib/permissions";
import { reviewQueue, approveVersions, reviewExam, publishExam } from "@/lib/academic/report-versions";
import { assertModuleRead, assertPermission } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { isCampusAdminRole } from "@/lib/roles";
import { generateReportCardPdf } from "@/lib/academic/pdf";
import {
  generateReportCardsForLockedExam,
  getExamAnalytics,
  isLockedStatus,
} from "@/lib/academic/report-cards";
import { notifyReportCardsGenerated } from "@/lib/notifications/automation";
import { sendReportCardPublishedNotifications } from "@/lib/notifications/service";
import { reportActionSchema } from "@/lib/validators/schemas";
import { assertFeatureEnabled, assertSchoolOperational } from "@/lib/billing/entitlements";

export const runtime = "nodejs";

function canManageReports(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

async function getScopedExam(examId: string, user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      campus: { select: { schoolId: true } },
      class: { select: { id: true, name: true, section: true, academicYear: true, classTeacherId: true, subjects: { select: { teacherId: true } } } },
      _count: { select: { reportCards: true } },
    },
  });

  if (!exam) {
    const error = new Error("Exam not found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  if (user.campusId && exam.campusId !== user.campusId) {
    const error = new Error("Exam is outside your campus");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  if (exam.campus.schoolId !== user.schoolId) {
    const error = new Error("Exam is outside your school");
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  if (!exam.isLocked && !isLockedStatus(exam.status)) {
    const error = new Error("Report cards can only be generated from locked exams");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  return exam;
}

async function ensureReportCards(examId: string) {
  const count = await prisma.reportCard.count({ where: { examId } });
  if (count > 0) return count;
  const generated = await generateReportCardsForLockedExam(examId);
  return generated.generated;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId");
  if (!examId) return Response.json({ error: "examId required" }, { status: 400 });

  try {
    await assertModuleRead(user, "reports");
    await assertSchoolOperational(user.schoolId);
    const exam = await getScopedExam(examId, user);

    const [reportCards, analytics] = await Promise.all([
      prisma.reportCard.findMany({
        where: { examId },
        include: {
          student: {
            select: {
              fullName: true,
              rollNo: true,
              guardianWhatsapp: true,
              guardianEmail: true,
              class: { select: { name: true, section: true } },
            },
          },
        },
        orderBy: [{ rank: "asc" }, { student: { rollNo: "asc" } }],
      }),
      getExamAnalytics(examId),
    ]);

    const versions = await reviewQueue(reportCards.map(r => r.id));
    const editable = Boolean((await loadPermissionMap(user.schoolId, user.role)).get("reports")?.canEdit);
    return Response.json({ success: true, exam, canEdit: editable && (canManageReports(user.role) || user.role === "TEACHER" && (exam.class.classTeacherId === user.userId || exam.class.subjects.some(s => s.teacherId === user.userId))), reportCards: reportCards.map(r => ({ ...r, review: versions.find(v => v.reportCardId === r.id) })), analytics, canReview: canManageReports(user.role) && editable });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    return Response.json({ error: error instanceof Error ? error.message : "Failed to load reports" }, { status });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageReports(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = reportActionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { examId, action } = parsed.data;

  try {
    await assertPermission(user, "reports", "edit");
    await assertSchoolOperational(user.schoolId);
    const exam = await getScopedExam(examId, user);

    if (action === "generate") {
      const generated = await generateReportCardsForLockedExam(examId);
      await notifyReportCardsGenerated({ examId, createdById: user.userId });
      return Response.json({ success: true, generated: generated.generated });
    }

    if (action === "pdf") {
      await assertFeatureEnabled(user.schoolId, "pdfExportEnabled");
      await ensureReportCards(examId);
      const reportCards = await prisma.reportCard.findMany({ where: { examId } });
      const generated = [];

      for (const reportCard of reportCards) {
        // Null means the PDF rendered but there was nowhere to cache it — a
        // read-only serverless filesystem with no S3 configured. The document
        // is still downloadable, rendered per request, so this is not a
        // failure and must not be recorded as one (§84).
        const pdfUrl = await generateReportCardPdf(reportCard.id);
        const updated = pdfUrl
          ? await prisma.reportCard.update({
              where: { id: reportCard.id },
              data: { pdfUrl },
            })
          : reportCard;
        generated.push(updated);
      }

      return Response.json({ success: true, generated: generated.length });
    }

    if (action === "approve") {
      const ids = parsed.data.versions ?? [];
      const allowed = await prisma.reportCard.count({ where: { examId, id: { in: ids.map(v => v.reportCardId) } } });
      if (allowed !== ids.length) return Response.json({ error: "Report is outside this exam" }, { status: 403 });
      const versions = await approveVersions(ids, user.userId, parsed.data.reviewerNote, parsed.data.correctionReason);
      return Response.json({ success: true, approved: versions.length });
    }
    if (action === "review") {
      await reviewExam(examId, user.userId);
      return Response.json({ success: true });
    }
    if (action === "publish") {
      return Response.json({ success: true, ...await publishExam(examId, user.userId, parsed.data.correctionReason) });
    }

    await ensureReportCards(examId);
    const reportCards = await prisma.reportCard.findMany({
      where: { examId },
      include: { student: true },
    });

    if (exam.status !== "PUBLISHED") {
      return Response.json({ error: "Publish report cards before sending" }, { status: 409 });
    }

    const communications = [];
    for (const reportCard of reportCards) communications.push(...await sendReportCardPublishedNotifications({ reportCardId: reportCard.id, createdById: user.userId }));
    return Response.json({ success: true, queued: communications.filter(c => c.status === "PENDING").length, communications });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    return Response.json({ error: error instanceof Error ? error.message : "Report action failed" }, { status });
  }
}
