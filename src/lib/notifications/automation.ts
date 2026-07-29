import { prisma } from "@/lib/db/prisma";
import {
  sendStudentTemplatedCommunication,
  sendTemplatedCommunication,
} from "./service";
import type { NotificationChannel } from "./templates";

const PARENT_CHANNELS: NotificationChannel[] = ["WHATSAPP", "EMAIL"];
const STAFF_CHANNEL: NotificationChannel = "EMAIL";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function balanceDue(invoice: { totalAmount: number; payments: Array<{ amount: number }> }) {
  return Math.max(invoice.totalAmount - invoice.payments.reduce((sum, payment) => sum + payment.amount, 0), 0);
}

async function staffRecipients({
  schoolId,
  campusId,
  roles,
}: {
  schoolId: string;
  campusId?: string | null;
  roles: string[];
}) {
  return prisma.user.findMany({
    where: {
      schoolId,
      ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}),
      role: { in: roles as any },
      isActive: true,
    },
    select: { id: true, fullName: true, email: true, phone: true },
  });
}

export async function triggerRepeatedAbsenceAlert({
  studentId,
  date,
  createdById,
}: {
  studentId: string;
  date: Date;
  createdById?: string | null;
}) {
  const since = addDays(date, -30);
  const absenceCount = await prisma.attendance.count({
    where: {
      studentId,
      status: "ABSENT",
      date: { gte: since, lte: date },
    },
  });

  if (absenceCount < 3) return [];

  return sendStudentTemplatedCommunication({
    studentId,
    key: "ATTENDANCE_ALERT",
    channels: PARENT_CHANNELS,
    context: {
      date: formatDate(date),
      absenceCount,
    },
    createdById,
    relatedType: "ATTENDANCE",
    relatedId: studentId,
    approvedData: true,
    idempotencyBase: `attendance-absence-3:${studentId}:${date.toISOString().slice(0, 10)}`,
    metadata: { absenceCount, windowDays: 30 },
  });
}

export async function triggerFeeDueReminders({
  schoolId,
  campusId,
}: {
  schoolId?: string;
  campusId?: string | null;
} = {}) {
  const dueDay = addDays(new Date(), 3);
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] as any },
      dueDate: { gte: startOfDay(dueDay), lte: endOfDay(dueDay) },
      campus: {
        ...(schoolId ? { schoolId } : {}),
        ...(campusId ? { id: campusId } : {}),
      },
    },
    include: { payments: true },
  });

  const results = [];
  for (const invoice of invoices) {
    const balance = balanceDue(invoice);
    if (balance <= 0) continue;
    results.push(
      ...(await sendStudentTemplatedCommunication({
        studentId: invoice.studentId,
        key: "FEE_DUE_REMINDER",
        channels: PARENT_CHANNELS,
        context: {
          term: `${invoice.invoiceDate.toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`,
          balanceDue: balance.toLocaleString("en-PK"),
          dueDate: formatDate(invoice.dueDate),
        },
        relatedType: "INVOICE",
        relatedId: invoice.id,
        approvedData: true,
        idempotencyBase: `fee-due-3-days:${invoice.id}`,
        metadata: { trigger: "fee_due_in_3_days" },
      }))
    );
  }

  return results;
}

export async function triggerFeeOverdueReminders({
  schoolId,
  campusId,
}: {
  schoolId?: string;
  campusId?: string | null;
} = {}) {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "PARTIAL"] as any },
      dueDate: { lt: startOfDay(now) },
      campus: {
        ...(schoolId ? { schoolId } : {}),
        ...(campusId ? { id: campusId } : {}),
      },
    },
    include: { payments: true },
  });

  const results = [];
  for (const invoice of invoices) {
    const balance = balanceDue(invoice);
    if (balance <= 0) continue;
    results.push(
      ...(await sendStudentTemplatedCommunication({
        studentId: invoice.studentId,
        key: "FEE_OVERDUE_REMINDER",
        channels: PARENT_CHANNELS,
        context: {
          term: `${invoice.invoiceDate.toLocaleDateString("en-PK", { month: "long", year: "numeric" })}`,
          balanceDue: balance.toLocaleString("en-PK"),
          dueDate: formatDate(invoice.dueDate),
        },
        relatedType: "INVOICE",
        relatedId: invoice.id,
        approvedData: true,
        idempotencyBase: `fee-overdue:${invoice.id}`,
        metadata: { trigger: "fee_overdue" },
      }))
    );
  }

  return results;
}

export async function triggerMarksEntryDeadlineReminders({
  schoolId,
  campusId,
}: {
  schoolId?: string;
  campusId?: string | null;
} = {}) {
  const now = new Date();
  const windowEnd = addDays(now, 1);
  const exams = await prisma.exam.findMany({
    where: {
      status: "MARKS_ENTRY",
      marksEntryAt: { not: null },
      campus: {
        ...(schoolId ? { schoolId } : {}),
        ...(campusId ? { id: campusId } : {}),
      },
    },
    include: {
      campus: { select: { schoolId: true, name: true, school: { select: { name: true } } } },
      class: { select: { name: true, section: true } },
    },
  });

  const results = [];
  for (const exam of exams) {
    const deadline = addDays(exam.marksEntryAt || now, 3);
    if (deadline < now || deadline > windowEnd) continue;

    const recipients = await staffRecipients({
      schoolId: exam.campus.schoolId,
      campusId: exam.campusId,
      roles: ["TEACHER", "PRINCIPAL", "CAMPUS_ADMIN", "ADMIN"],
    });

    for (const recipient of recipients) {
      results.push(
        await sendTemplatedCommunication({
          key: "MARKS_ENTRY_DEADLINE_NEAR",
          channel: STAFF_CHANNEL,
          context: {
            recipientName: recipient.fullName,
            examTitle: exam.title,
            deadlineDate: formatDate(deadline),
            className: [exam.class.name, exam.class.section].filter(Boolean).join(" - "),
            schoolName: exam.campus.school.name,
          },
          target: {
            schoolId: exam.campus.schoolId,
            campusId: exam.campusId,
            recipientName: recipient.fullName,
            recipient: recipient.email,
          },
          relatedType: "EXAM",
          relatedId: exam.id,
          approvedData: true,
          idempotencyKey: `marks-entry-deadline:${exam.id}:${recipient.id}:${STAFF_CHANNEL}`,
          metadata: { trigger: "marks_entry_deadline_near" },
        })
      );
    }
  }

  return results;
}

export async function triggerPrincipalReviewPending({
  schoolId,
  campusId,
}: {
  schoolId?: string;
  campusId?: string | null;
} = {}) {
  const exams = await prisma.exam.findMany({
    where: {
      OR: [{ isLocked: true }, { status: "LOCKED" }],
      campus: {
        ...(schoolId ? { schoolId } : {}),
        ...(campusId ? { id: campusId } : {}),
      },
    },
    include: {
      campus: { select: { schoolId: true, school: { select: { name: true } } } },
      class: { select: { name: true, section: true } },
      _count: { select: { reportCards: true } },
    },
  });

  const results = [];
  for (const exam of exams) {
    if (exam._count.reportCards === 0) continue;
    const pendingCount = await prisma.reportCard.count({
      where: {
        examId: exam.id,
        OR: [{ remarksApproved: false }, { remarksEn: null, remarksUr: null }],
      },
    });

    const recipients = await staffRecipients({
      schoolId: exam.campus.schoolId,
      campusId: exam.campusId,
      roles: ["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"],
    });

    for (const recipient of recipients) {
      results.push(
        await sendTemplatedCommunication({
          key: "PRINCIPAL_REVIEW_PENDING",
          channel: STAFF_CHANNEL,
          context: {
            recipientName: recipient.fullName,
            examTitle: exam.title,
            className: [exam.class.name, exam.class.section].filter(Boolean).join(" - "),
            pendingCount,
            schoolName: exam.campus.school.name,
          },
          target: {
            schoolId: exam.campus.schoolId,
            campusId: exam.campusId,
            recipientName: recipient.fullName,
            recipient: recipient.email,
          },
          relatedType: "EXAM",
          relatedId: exam.id,
          approvedData: true,
          idempotencyKey: `principal-review-pending:${exam.id}:${recipient.id}:${STAFF_CHANNEL}`,
          metadata: { trigger: "principal_review_pending" },
        })
      );
    }
  }

  return results;
}

export async function notifyReportCardsGenerated({
  examId,
  createdById,
}: {
  examId: string;
  createdById?: string | null;
}) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      campus: { select: { schoolId: true, school: { select: { name: true } } } },
      _count: { select: { reportCards: true } },
    },
  });

  if (!exam || exam._count.reportCards === 0) return [];

  const recipients = await staffRecipients({
    schoolId: exam.campus.schoolId,
    campusId: exam.campusId,
    roles: ["PRINCIPAL", "CAMPUS_ADMIN", "ADMIN", "SUPER_ADMIN"],
  });

  const results = [];
  for (const recipient of recipients) {
    results.push(
      await sendTemplatedCommunication({
        key: "REPORT_CARD_GENERATED",
        channel: STAFF_CHANNEL,
        context: {
          recipientName: recipient.fullName,
          examTitle: exam.title,
          reportCount: exam._count.reportCards,
          schoolName: exam.campus.school.name,
        },
        target: {
          schoolId: exam.campus.schoolId,
          campusId: exam.campusId,
          recipientName: recipient.fullName,
          recipient: recipient.email,
        },
        createdById,
        relatedType: "EXAM",
        relatedId: exam.id,
        approvedData: true,
        idempotencyKey: `report-card-generated:${exam.id}:${recipient.id}:${STAFF_CHANNEL}`,
        metadata: { trigger: "report_card_generated" },
      })
    );
  }

  return results;
}

export async function runNotificationAutomationSweep({
  schoolId,
  campusId,
  trigger,
}: {
  schoolId?: string;
  campusId?: string | null;
  trigger?: string;
} = {}) {
  const results = [];
  if (!trigger || trigger === "fee_due_in_3_days") {
    results.push(...(await triggerFeeDueReminders({ schoolId, campusId })));
  }
  if (!trigger || trigger === "fee_overdue") {
    results.push(...(await triggerFeeOverdueReminders({ schoolId, campusId })));
  }
  if (!trigger || trigger === "marks_entry_deadline_near") {
    results.push(...(await triggerMarksEntryDeadlineReminders({ schoolId, campusId })));
  }
  if (!trigger || trigger === "principal_review_pending") {
    results.push(...(await triggerPrincipalReviewPending({ schoolId, campusId })));
  }

  return results;
}
