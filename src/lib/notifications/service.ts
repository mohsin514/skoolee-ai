import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canUseFeature } from "@/config/plans";
import { isSchoolOperational } from "@/lib/billing/entitlements";
import { sendEmailMessage } from "@/lib/email";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import {
  defaultTemplateFor,
  isNotificationChannel,
  isNotificationTemplateKey,
  type NotificationChannel,
  type NotificationTemplateDefinition,
  type NotificationTemplateKey,
} from "./templates";

type TemplateContext = Record<string, string | number | boolean | null | undefined>;

interface RecipientTarget {
  schoolId: string;
  campusId?: string | null;
  studentId?: string | null;
  parentUserId?: string | null;
  recipientName?: string | null;
  recipient?: string | null;
}

interface SendTemplateInput {
  key: NotificationTemplateKey;
  channel: NotificationChannel;
  context: TemplateContext;
  target: RecipientTarget;
  createdById?: string | null;
  attachmentUrl?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  approvedData: boolean;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

interface StudentContext {
  id: string;
  fullName: string;
  guardianName: string | null;
  guardianWhatsapp: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  parentUserId: string | null;
  parent?: { fullName: string; phone: string | null; email: string } | null;
  campusId: string;
  campus: {
    name: string;
    phone: string | null;
    schoolId: string;
    school: { name: string };
  };
  class?: { name: string; section: string | null } | null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function absoluteUrl(url: string | null | undefined) {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `${appUrl()}${url}`;
}

function templatePriority(template: { schoolId: string | null; campusId: string | null }, schoolId: string, campusId?: string | null) {
  if (campusId && template.schoolId === schoolId && template.campusId === campusId) return 3;
  if (template.schoolId === schoolId && !template.campusId) return 2;
  if (!template.schoolId && !template.campusId) return 1;
  return 0;
}

function valueFor(context: TemplateContext, key: string) {
  const value = context[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function renderText(text: string, context: TemplateContext) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => valueFor(context, key));
}

function normalizeTemplate(
  template: {
    key: string;
    channel: string;
    title: string;
    subject: string | null;
    body: string;
    variables: Prisma.JsonValue | null;
    isSensitive: boolean;
    requiresApprovedData: boolean;
  } | NotificationTemplateDefinition
): NotificationTemplateDefinition {
  const variables: string[] = Array.isArray(template.variables)
    ? (template.variables as unknown[]).filter((item): item is string => typeof item === "string")
    : [];

  return {
    key: template.key as NotificationTemplateKey,
    channel: template.channel as NotificationChannel,
    title: template.title,
    subject: template.subject || undefined,
    body: template.body,
    variables,
    isSensitive: template.isSensitive,
    requiresApprovedData: template.requiresApprovedData,
  };
}

export async function getApprovedNotificationTemplate({
  key,
  channel,
  schoolId,
  campusId,
}: {
  key: NotificationTemplateKey;
  channel: NotificationChannel;
  schoolId: string;
  campusId?: string | null;
}) {
  const scopes = campusId
    ? [
        { schoolId, campusId },
        { schoolId, campusId: null },
        { schoolId: null, campusId: null },
      ]
    : [
        { schoolId, campusId: null },
        { schoolId: null, campusId: null },
      ];

  const candidates = await prisma.notificationTemplate.findMany({
    where: {
      key,
      channel,
      isActive: true,
      status: "APPROVED",
      OR: scopes,
    },
  });

  const template = candidates
    .sort((a, b) => templatePriority(b, schoolId, campusId) - templatePriority(a, schoolId, campusId))[0];

  if (template) return normalizeTemplate(template);

  const fallback = defaultTemplateFor(key, channel);
  if (!fallback) throw new Error(`Template ${key} is not configured for ${channel}`);
  return fallback;
}

export function renderNotificationTemplate(template: NotificationTemplateDefinition, context: TemplateContext) {
  return {
    subject: template.subject ? renderText(template.subject, context) : template.title,
    body: renderText(template.body, context),
  };
}

function recipientForStudent(student: StudentContext, channel: NotificationChannel) {
  if (channel === "EMAIL") return student.guardianEmail || student.parent?.email || null;
  if (channel === "WHATSAPP") return student.guardianWhatsapp || student.parent?.phone || student.guardianPhone || null;
  return student.guardianPhone || student.guardianWhatsapp || student.parent?.phone || null;
}

export function studentBaseContext(student: StudentContext): TemplateContext {
  const className = [student.class?.name, student.class?.section].filter(Boolean).join(" - ");

  return {
    parentName: student.guardianName || student.parent?.fullName || "Parent",
    recipientName: student.guardianName || student.parent?.fullName || "Parent",
    studentName: student.fullName,
    className,
    campusName: student.campus.name,
    campusPhone: student.campus.phone || "",
    schoolName: student.campus.school.name,
  };
}

export async function getStudentCommunicationContext(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      parent: { select: { fullName: true, phone: true, email: true } },
      campus: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          website: true,
          schoolId: true,
          school: { select: { name: true, logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true } },
        },
      },
      class: { select: { name: true, section: true } },
    },
  });

  if (!student) throw new Error("Student not found");

  return student as StudentContext;
}

async function findExistingByIdempotency(idempotencyKey?: string) {
  if (!idempotencyKey) return null;
  return prisma.parentCommunication.findUnique({ where: { idempotencyKey } });
}

export async function sendTemplatedCommunication(input: SendTemplateInput) {
  const existing = await findExistingByIdempotency(input.idempotencyKey);
  if (existing?.status === "SENT") return existing;

  const template = await getApprovedNotificationTemplate({
    key: input.key,
    channel: input.channel,
    schoolId: input.target.schoolId,
    campusId: input.target.campusId,
  });
  const rendered = renderNotificationTemplate(template, input.context);
  const recipient = input.target.recipient || "UNAVAILABLE";
  const school =
    input.channel === "WHATSAPP"
      ? await prisma.school.findUnique({
          where: { id: input.target.schoolId },
          select: { plan: true, status: true },
        })
      : null;
  const subscriptionBlockedReason =
    school && !isSchoolOperational(school.status)
      ? "Subscription suspended. Open billing to update your plan or payment method."
      : null;
  const planBlockedReason =
    school && !canUseFeature(school.plan, "whatsappEnabled")
      ? "WhatsApp messaging is not included in the current plan"
      : null;
  const dataBlockedReason =
    template.requiresApprovedData && !input.approvedData
      ? "Approved school data is required before this communication can be sent"
      : null;
  const blockedReason = subscriptionBlockedReason || planBlockedReason || dataBlockedReason;
  const noRecipientReason = input.target.recipient ? null : `No ${input.channel.toLowerCase()} contact is on file`;

  const communicationData = {
    schoolId: input.target.schoolId,
    campusId: input.target.campusId || null,
    studentId: input.target.studentId || null,
    parentUserId: input.target.parentUserId || null,
    createdById: input.createdById || null,
    templateKey: input.key,
    channel: input.channel,
    recipientName: input.target.recipientName || null,
    recipient,
    subject: rendered.subject,
    body: rendered.body,
    attachmentUrl: input.attachmentUrl || null,
    relatedType: input.relatedType || null,
    relatedId: input.relatedId || null,
    status: blockedReason ? "BLOCKED" : noRecipientReason ? "NO_RECIPIENT" : "PENDING",
    providerMessageId: null,
    failedReason: blockedReason || noRecipientReason,
    approvedData: input.approvedData,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata ? jsonValue(input.metadata) : undefined,
    sentAt: null,
  };

  const communication = existing
    ? await prisma.parentCommunication.update({
        where: { id: existing.id },
        data: communicationData,
      })
    : await prisma.parentCommunication.create({
        data: communicationData,
      });

  if (blockedReason || noRecipientReason) return communication;

  if (input.channel === "SMS") {
    return prisma.parentCommunication.update({
      where: { id: communication.id },
      data: {
        status: "FAILED",
        failedReason: "SMS delivery is not configured yet",
      },
    });
  }

  const result =
    input.channel === "WHATSAPP"
      ? await sendWhatsAppMessage({
          to: recipient,
          text: rendered.body,
          pdfUrl: input.attachmentUrl || undefined,
        })
      : await sendEmailMessage({
          to: recipient,
          subject: rendered.subject,
          text: rendered.body,
        });

  return prisma.parentCommunication.update({
    where: { id: communication.id },
    data: {
      status: result.success ? "SENT" : "FAILED",
      providerMessageId: result.messageId || null,
      failedReason: result.success ? null : result.error || "Delivery failed",
      sentAt: result.success ? new Date() : null,
    },
  });
}

export async function sendStudentTemplatedCommunication({
  studentId,
  key,
  channels,
  context,
  createdById,
  attachmentUrl,
  relatedType,
  relatedId,
  approvedData,
  idempotencyBase,
  metadata,
}: {
  studentId: string;
  key: NotificationTemplateKey;
  channels: NotificationChannel[];
  context: TemplateContext;
  createdById?: string | null;
  attachmentUrl?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  approvedData: boolean;
  idempotencyBase?: string;
  metadata?: Record<string, unknown>;
}) {
  const student = await getStudentCommunicationContext(studentId);
  const baseContext = studentBaseContext(student);

  const results = [];
  for (const channel of channels) {
    const recipient = recipientForStudent(student, channel);
    results.push(
      await sendTemplatedCommunication({
        key,
        channel,
        context: { ...baseContext, ...context },
        target: {
          schoolId: student.campus.schoolId,
          campusId: student.campusId,
          studentId: student.id,
          parentUserId: student.parentUserId,
          recipientName: valueFor(baseContext, "parentName"),
          recipient,
        },
        createdById,
        attachmentUrl,
        relatedType,
        relatedId,
        approvedData,
        idempotencyKey: idempotencyBase ? `${idempotencyBase}:${channel}` : undefined,
        metadata,
      })
    );
  }

  return results;
}

export async function sendReportCardPublishedNotifications({
  reportCardId,
  channels = ["WHATSAPP", "EMAIL"],
  createdById,
  approvedData,
}: {
  reportCardId: string;
  channels?: NotificationChannel[];
  createdById?: string | null;
  approvedData?: boolean;
}) {
  const reportCard = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    include: {
      exam: { select: { title: true, status: true, publishedAt: true } },
      student: { select: { id: true } },
    },
  });

  if (!reportCard) throw new Error("Report card not found");

  const dataApproved =
    approvedData ??
    (reportCard.remarksApproved &&
      (reportCard.status === "PUBLISHED" || reportCard.status === "SENT") &&
      reportCard.exam.status === "PUBLISHED" &&
      Boolean(reportCard.exam.publishedAt));

  return sendStudentTemplatedCommunication({
    studentId: reportCard.student.id,
    key: "REPORT_CARD_PUBLISHED",
    channels,
    context: {
      examTitle: reportCard.exam.title,
      grade: reportCard.grade || "-",
      percentage: reportCard.percentage.toFixed(1),
      viewInstruction: reportCard.pdfUrl ? "The PDF report card is attached." : "Please log in to the portal to view the report card.",
    },
    createdById,
    attachmentUrl: absoluteUrl(reportCard.pdfUrl),
    relatedType: "REPORT_CARD",
    relatedId: reportCard.id,
    approvedData: dataApproved,
    idempotencyBase: `report-card-published:${reportCard.id}`,
    metadata: { examStatus: reportCard.exam.status, reportCardStatus: reportCard.status },
  });
}

export function parseNotificationChannel(value: unknown, fallback: NotificationChannel = "WHATSAPP") {
  return isNotificationChannel(value) ? value : fallback;
}

export function parseNotificationTemplateKey(value: unknown) {
  return isNotificationTemplateKey(value) ? value : null;
}
