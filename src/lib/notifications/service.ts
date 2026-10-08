import { familyVersion, getPublishedVersion, versionTransaction } from "@/lib/academic/report-versions";
import { appendEvent } from "@/lib/queue/outbox";
import { getLocalePackage } from "@/lib/locale/store";
import { formatDateOnly, formatMoney, localeTag, localePackageSchema, type Language } from "@/lib/locale/package";
import { notificationHtml } from "@/lib/locale/notification-catalog";
import { assertCommunicationTarget, assertPublishedCommunicationReport } from "@/lib/auth/communication-policy";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizePlan } from "@/config/plans";
import { getSchoolPlanContract } from "@/config/commercial-contract";
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
  language = "en",
}: {
  language?: Language;
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
      language,
      isActive: true,
      status: "APPROVED",
      OR: scopes,
    },
  });

  const template = candidates
    .sort((a, b) => templatePriority(b, schoolId, campusId) - templatePriority(a, schoolId, campusId))[0];

  if (template) return normalizeTemplate(template);

  const fallback = defaultTemplateFor(key, channel, language);
  if (!fallback) throw new Error(`Template ${key} is not configured for ${channel}`);
  return fallback;
}

export function renderNotificationTemplate(template: NotificationTemplateDefinition, context: TemplateContext) {
  return {
    subject: template.subject ? renderText(template.subject, context) : template.title,
    body: renderText(template.body, context),
  };
}

async function authorizedGuardianRecipients(studentId: string, schoolId: string, channel: NotificationChannel) {
  const now = new Date();
  const links = await prisma.guardianRelationship.findMany({
    where: {
      schoolId, studentId, status: "ACTIVE", guardianUserId: { not: null },
      verifiedAt: { not: null }, validFrom: { lte: now },
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        { guardian: { isActive: true } },
        { accessVersions: { some: {
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
          permissions: { path: ["communication"], equals: true },
        } } },
      ],
    },
    select: { fullName: true, email: true, phone: true, guardianUserId: true, guardian: { select: { phone: true } } },
    orderBy: { createdAt: "asc" },
  });
  return links.flatMap((link) => {
    const recipient = channel === "EMAIL" ? link.email : link.phone || link.guardian?.phone;
    if (!link.guardianUserId || !recipient) return [];
    return [{ guardianUserId: link.guardianUserId, fullName: link.fullName, recipient }];
  });
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
  await assertCommunicationTarget(input.target, input.channel);
  if (input.key === "REPORT_CARD_PUBLISHED") {
    await assertPublishedCommunicationReport(input.relatedId || "", input.target.studentId);
    const version = await getPublishedVersion(input.relatedId || "");
    const report = familyVersion(version);
    if (!input.createdById) throw new Error("Report delivery requires an authorized actor");
    // Callers cannot replace approved facts, document identity, approval or logical delivery identity.
    input = { ...input, approvedData: true, attachmentUrl: null,
      idempotencyKey: `report-version:${version.id}:${input.channel}:${input.target.parentUserId || "unlinked"}`,
      context: { ...input.context, examTitle: report.examTitle, grade: report.grade || "-", percentage: report.percentage.toFixed(1), viewInstruction: "Please log in to the portal to view the report card." },
      metadata: { reportVersionId: version.id, documentIdentity: version.documentIdentity },
    };
  }
  const existing = await findExistingByIdempotency(input.idempotencyKey);
  if (existing?.status === "SENT") return existing;

  const parent = input.target.parentUserId ? await prisma.user.findFirst({ where: { id: input.target.parentUserId, schoolId: input.target.schoolId }, select: { preferredLanguage: true } }) : null;
  let locale = await getLocalePackage(input.target.schoolId, input.target.campusId || null);
  const context = { ...input.context };
  if (input.relatedType === "INVOICE" && input.relatedId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: input.relatedId, schoolId: input.target.schoolId } });
    if (invoice) {
      const snapshot = localePackageSchema.safeParse(invoice.localeSnapshot);
      if (snapshot.success) locale = snapshot.data;
      if (parent?.preferredLanguage === "en" || parent?.preferredLanguage === "ar" || parent?.preferredLanguage === "ur") locale = { ...locale, language: parent.preferredLanguage };
      context.balanceDue = formatMoney({ minor: typeof context.balanceDueMinor === "number" && Number.isSafeInteger(context.balanceDueMinor) ? context.balanceDueMinor : invoice.balanceDue, currency: invoice.currency }, locale);
      context.dueDate = formatDateOnly(invoice.dueDate.toISOString().slice(0, 10), locale);
      context.term = new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long", timeZone: "UTC" }).format(invoice.invoiceDate);
    }
  }
  if (parent?.preferredLanguage === "en" || parent?.preferredLanguage === "ar" || parent?.preferredLanguage === "ur") locale = { ...locale, language: parent.preferredLanguage };
  if (input.key === "REPORT_CARD_PUBLISHED") {
    const instructions = {
      en: ["The PDF report card is attached.", "Please log in to the portal to view the report card."],
      ar: ["بطاقة التقرير بصيغة PDF مرفقة.", "يرجى تسجيل الدخول إلى البوابة لعرض بطاقة التقرير."],
      ur: ["پی ڈی ایف رپورٹ کارڈ منسلک ہے۔", "رپورٹ کارڈ دیکھنے کے لیے پورٹل میں لاگ ان کریں۔"],
    };
    context.viewInstruction = instructions[locale.language][input.attachmentUrl ? 0 : 1];
  }
  for (const key of ["date", "dueDate", "meetingDate", "deadlineDate"]) {
    const value = context[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) context[key] = formatDateOnly(value, locale);
  }
  const template = await getApprovedNotificationTemplate({
    language: locale.language,
    key: input.key,
    channel: input.channel,
    schoolId: input.target.schoolId,
    campusId: input.target.campusId,
  });
  const rendered = renderNotificationTemplate(template, context);
  const recipient = input.target.recipient || "UNAVAILABLE";
  const school =
    input.channel === "WHATSAPP"
      ? await prisma.school.findUnique({
          where: { id: input.target.schoolId },
          select: { plan: true, status: true, commercialContract: true },
        })
      : null;
  const subscriptionBlockedReason =
    school && !isSchoolOperational(school.status)
      ? "Subscription suspended. Open billing to update your plan or payment method."
      : null;
  const planBlockedReason =
    school && !getSchoolPlanContract(normalizePlan(school.plan), school.commercialContract).whatsappEnabled
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
    metadata: jsonValue({ ...input.metadata, localeSnapshot: locale }),
    sentAt: null,
  };

  if (input.key === "REPORT_CARD_PUBLISHED") {
    return versionTransaction(async tx => {
      const prior = await tx.parentCommunication.findUnique({ where: { idempotencyKey: input.idempotencyKey! } });
      if (prior) return prior;
      const communication = await tx.parentCommunication.create({ data: communicationData });
      if (!blockedReason && !noRecipientReason) await appendEvent(tx, {
        schoolId: input.target.schoolId, actorId: input.createdById!, referenceId: communication.id,
        kind: "REPORT_DELIVERY", version: 1, identity: `report-delivery:${input.idempotencyKey}`,
      });
      return communication;
    }).catch(async error => {
      // Concurrent requests converge on the one unique logical delivery.
      if ((error as { code?: string }).code === "P2002" || (error as { status?: number }).status === 409) {
        const prior = await prisma.parentCommunication.findUnique({ where: { idempotencyKey: input.idempotencyKey! } });
        if (prior) return prior;
      }
      throw error;
    });
  }

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
          html: notificationHtml(rendered.body, locale.language),
          language: locale.language,
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
    const recipients = await authorizedGuardianRecipients(student.id, student.campus.schoolId, channel);
    for (const guardian of recipients) results.push(await sendTemplatedCommunication({
      key,
      channel,
      context: { ...baseContext, ...context, parentName: guardian.fullName, recipientName: guardian.fullName },
      target: {
        schoolId: student.campus.schoolId,
        campusId: student.campusId,
        studentId: student.id,
        parentUserId: guardian.guardianUserId,
        recipientName: guardian.fullName,
        recipient: guardian.recipient,
      },
      createdById,
      attachmentUrl,
      relatedType,
      relatedId,
      approvedData,
      idempotencyKey: idempotencyBase ? `${idempotencyBase}:${channel}:${guardian.guardianUserId}` : undefined,
      metadata,
    }));
  }

  return results;
}

export async function sendReportCardPublishedNotifications({ reportCardId, channels = ["WHATSAPP", "EMAIL"], createdById }: {
  reportCardId: string; channels?: NotificationChannel[]; createdById?: string | null;
}) {
  const version = await getPublishedVersion(reportCardId);
  const report = familyVersion(version);
  return sendStudentTemplatedCommunication({ studentId: report.studentId, key: "REPORT_CARD_PUBLISHED", channels,
    context: { examTitle: report.examTitle, grade: report.grade || "-", percentage: report.percentage.toFixed(1), viewInstruction: "Please log in to the portal to view the report card." },
    createdById, relatedType: "REPORT_CARD", relatedId: reportCardId, approvedData: true,
    idempotencyBase: `report-version:${version.id}`, metadata: { reportVersionId: version.id, documentIdentity: version.documentIdentity },
  });
}

export function parseNotificationTemplateKey(value: unknown) {
  return isNotificationTemplateKey(value) ? value : null;
}
