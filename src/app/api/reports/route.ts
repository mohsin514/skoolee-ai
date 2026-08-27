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
import { notify } from "@/lib/notifications/in-app";
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
      class: { select: { id: true, name: true, section: true, academicYear: true } },
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
    await assertSchoolOperational(user.schoolId);
    const exam = await getScopedExam(examId, user);
    if (exam._count.reportCards === 0) {
      await generateReportCardsForLockedExam(examId);
    }

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

    return Response.json({ success: true, exam, reportCards, analytics });
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

    if (action === "review") {
      const pending = await prisma.reportCard.count({
        where: {
          examId,
          OR: [
            { remarksApproved: false },
            { remarksEn: null, remarksUr: null },
          ],
        },
      });

      if (pending > 0) {
        return Response.json(
          { error: `${pending} report cards still need approved remarks` },
          { status: 409 }
        );
      }

      await prisma.$transaction([
        prisma.reportCard.updateMany({
          where: { examId },
          data: { status: "REVIEWED" },
        }),
        prisma.exam.update({
          where: { id: examId },
          data: { status: "PRINCIPAL_REVIEWED", reviewedBy: user.userId, reviewedAt: new Date() },
        }),
      ]);

      notify("REPORT_CARDS_REVIEWED", {
        schoolId: user.schoolId,
        campusId: exam.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        examTitle: exam.title,
        classId: exam.class?.id,
      });

      return Response.json({ success: true });
    }

    if (action === "publish") {
      if (exam.status !== "PRINCIPAL_REVIEWED") {
        return Response.json({ error: "Principal review is required before publishing" }, { status: 409 });
      }

      // Publishing used to require every card to carry a stored pdfUrl. Where
      // the host cannot write files that column is permanently null, so the
      // gate could never be satisfied and publishing was impossible. What
      // actually matters is that the cards exist — the PDF is rendered on
      // demand from the same data either way.
      const cardCount = await prisma.reportCard.count({ where: { examId } });
      if (cardCount === 0) {
        return Response.json(
          { error: "There are no report cards to publish yet" },
          { status: 409 },
        );
      }

      await prisma.$transaction([
        prisma.reportCard.updateMany({
          where: { examId },
          data: { status: "PUBLISHED" },
        }),
        prisma.exam.update({
          where: { id: examId },
          data: { status: "PUBLISHED", publishedAt: new Date() },
        }),
      ]);

      notify("REPORT_CARDS_PUBLISHED", {
        schoolId: user.schoolId,
        campusId: exam.campusId,
        actorId: user.userId,
        actorName: user.fullName,
        examTitle: exam.title,
        classId: exam.class?.id,
      });

      return Response.json({ success: true });
    }

    await ensureReportCards(examId);
    const reportCards = await prisma.reportCard.findMany({
      where: { examId },
      include: { student: true },
    });

    if (exam.status !== "PUBLISHED") {
      return Response.json({ error: "Publish report cards before sending" }, { status: 409 });
    }

    const unapproved = await prisma.reportCard.count({
      where: {
        examId,
        OR: [
          { remarksApproved: false },
          { remarksEn: null, remarksUr: null },
        ],
      },
    });
    if (unapproved > 0) {
      return Response.json(
        { error: `${unapproved} report cards still need approved remarks` },
        { status: 409 }
      );
    }

    let sent = 0;
    let failed = 0;

    for (const reportCard of reportCards) {
      const channels: string[] = [];
      const errors: string[] = [];

      const communications = await sendReportCardPublishedNotifications({
        reportCardId: reportCard.id,
        createdById: user.userId,
      });

      for (const communication of communications) {
        if (communication.status === "SENT") {
          channels.push(communication.channel);
        } else if (communication.failedReason) {
          errors.push(`${communication.channel}: ${communication.failedReason}`);
        } else if (communication.status !== "PENDING") {
          errors.push(`${communication.channel}: ${communication.status}`);
        }
      }

      if (channels.length === 0 && communications.every((communication) => communication.status === "NO_RECIPIENT")) {
        await prisma.reportCard.update({
          where: { id: reportCard.id },
          data: {
            deliveryStatus: "NO_CONTACT",
            deliveryError: "No parent WhatsApp or email on file",
          },
        });
        failed += 1;
        continue;
      }

      if (channels.length > 0) {
        await prisma.reportCard.update({
          where: { id: reportCard.id },
          data: {
            isSent: true,
            status: "SENT",
            sentVia: channels.length === 2 ? "BOTH" : channels[0],
            sentAt: new Date(),
            deliveryStatus: "SENT",
            deliveryError: errors.length ? errors.join("; ") : null,
          },
        });
        sent += 1;
      } else {
        await prisma.reportCard.update({
          where: { id: reportCard.id },
          data: {
            deliveryStatus: communications.some((communication) => communication.status === "BLOCKED") ? "BLOCKED" : "FAILED",
            deliveryError: errors.join("; ") || "Delivery failed",
          },
        });
        failed += 1;
      }
    }

    return Response.json({ success: true, sent, failed });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 500;
    return Response.json({ error: error instanceof Error ? error.message : "Report action failed" }, { status });
  }
}
