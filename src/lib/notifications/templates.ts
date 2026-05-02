export const NOTIFICATION_CHANNELS = ["WHATSAPP", "EMAIL", "SMS"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TEMPLATE_KEYS = [
  "ATTENDANCE_ALERT",
  "FEE_DUE_REMINDER",
  "FEE_OVERDUE_REMINDER",
  "EXAM_SCHEDULE",
  "REPORT_CARD_PUBLISHED",
  "PARENT_MEETING_INVITE",
  "GENERAL_ANNOUNCEMENT",
  "MARKS_ENTRY_DEADLINE_NEAR",
  "PRINCIPAL_REVIEW_PENDING",
  "REPORT_CARD_GENERATED",
] as const;

export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[number];

export interface NotificationTemplateDefinition {
  key: NotificationTemplateKey;
  channel: NotificationChannel;
  title: string;
  subject?: string;
  body: string;
  variables: string[];
  isSensitive: boolean;
  requiresApprovedData: boolean;
}

type TemplateSeed = Omit<NotificationTemplateDefinition, "channel">;

const parentTemplates: Record<NotificationTemplateKey, TemplateSeed> = {
  ATTENDANCE_ALERT: {
    key: "ATTENDANCE_ALERT",
    title: "Attendance alert",
    subject: "Attendance alert for {{studentName}}",
    body:
      "Dear {{parentName}},\n\n{{studentName}} was marked absent on {{date}}. This is absence {{absenceCount}} in the recent attendance period.\n\nPlease contact {{campusName}} if you need support.\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "date", "absenceCount", "campusName", "schoolName"],
    isSensitive: true,
    requiresApprovedData: true,
  },
  FEE_DUE_REMINDER: {
    key: "FEE_DUE_REMINDER",
    title: "Fee due reminder",
    subject: "Fee reminder for {{studentName}}",
    body:
      "Dear {{parentName}},\n\nThis is a reminder that {{studentName}}'s {{term}} fee of Rs {{balanceDue}} is due on {{dueDate}}.\n\nPlease ignore this message if payment has already been made.\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "term", "balanceDue", "dueDate", "schoolName"],
    isSensitive: true,
    requiresApprovedData: true,
  },
  FEE_OVERDUE_REMINDER: {
    key: "FEE_OVERDUE_REMINDER",
    title: "Fee overdue reminder",
    subject: "Overdue fee reminder for {{studentName}}",
    body:
      "Dear {{parentName}},\n\n{{studentName}}'s {{term}} fee of Rs {{balanceDue}} was due on {{dueDate}} and is now overdue.\n\nPlease contact {{campusName}} for payment support.\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "term", "balanceDue", "dueDate", "campusName", "schoolName"],
    isSensitive: true,
    requiresApprovedData: true,
  },
  EXAM_SCHEDULE: {
    key: "EXAM_SCHEDULE",
    title: "Exam schedule",
    subject: "Exam schedule for {{studentName}}",
    body:
      "Dear {{parentName}},\n\n{{examTitle}} for {{className}} is scheduled for {{term}} {{academicYear}}. Please help {{studentName}} prepare and follow campus instructions.\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "examTitle", "className", "term", "academicYear", "schoolName"],
    isSensitive: true,
    requiresApprovedData: true,
  },
  REPORT_CARD_PUBLISHED: {
    key: "REPORT_CARD_PUBLISHED",
    title: "Report card published",
    subject: "{{studentName}}'s report card is ready",
    body:
      "Dear {{parentName}},\n\n{{studentName}}'s report card for {{examTitle}} has been published.\n\nGrade: {{grade}}\nPercentage: {{percentage}}%\n\n{{viewInstruction}}\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "examTitle", "grade", "percentage", "viewInstruction", "schoolName"],
    isSensitive: true,
    requiresApprovedData: true,
  },
  PARENT_MEETING_INVITE: {
    key: "PARENT_MEETING_INVITE",
    title: "Parent meeting invite",
    subject: "Parent meeting invitation",
    body:
      "Dear {{parentName}},\n\nYou are invited to a parent meeting for {{studentName}} on {{meetingDate}} at {{meetingTime}}.\n\nLocation: {{meetingLocation}}\n\n{{schoolName}}",
    variables: ["parentName", "studentName", "meetingDate", "meetingTime", "meetingLocation", "schoolName"],
    isSensitive: false,
    requiresApprovedData: false,
  },
  GENERAL_ANNOUNCEMENT: {
    key: "GENERAL_ANNOUNCEMENT",
    title: "General announcement",
    subject: "{{announcementTitle}}",
    body:
      "Dear {{parentName}},\n\n{{announcementBody}}\n\n{{schoolName}}",
    variables: ["parentName", "announcementTitle", "announcementBody", "schoolName"],
    isSensitive: false,
    requiresApprovedData: false,
  },
  MARKS_ENTRY_DEADLINE_NEAR: {
    key: "MARKS_ENTRY_DEADLINE_NEAR",
    title: "Marks entry deadline near",
    subject: "Marks entry deadline near",
    body:
      "Dear {{recipientName}},\n\nMarks entry for {{examTitle}} is due by {{deadlineDate}}. Please complete pending marks for {{className}}.\n\n{{schoolName}}",
    variables: ["recipientName", "examTitle", "deadlineDate", "className", "schoolName"],
    isSensitive: false,
    requiresApprovedData: false,
  },
  PRINCIPAL_REVIEW_PENDING: {
    key: "PRINCIPAL_REVIEW_PENDING",
    title: "Principal review pending",
    subject: "Principal review pending for {{examTitle}}",
    body:
      "Dear {{recipientName}},\n\n{{examTitle}} for {{className}} has report cards ready for principal review.\n\nPending reports: {{pendingCount}}\n\n{{schoolName}}",
    variables: ["recipientName", "examTitle", "className", "pendingCount", "schoolName"],
    isSensitive: false,
    requiresApprovedData: false,
  },
  REPORT_CARD_GENERATED: {
    key: "REPORT_CARD_GENERATED",
    title: "Report card generated",
    subject: "Report cards generated for {{examTitle}}",
    body:
      "Dear {{recipientName}},\n\nReport cards for {{examTitle}} have been generated and are waiting for review and publishing.\n\nGenerated reports: {{reportCount}}\n\n{{schoolName}}",
    variables: ["recipientName", "examTitle", "reportCount", "schoolName"],
    isSensitive: false,
    requiresApprovedData: false,
  },
};

export const DEFAULT_NOTIFICATION_TEMPLATES = NOTIFICATION_TEMPLATE_KEYS.flatMap((key) =>
  NOTIFICATION_CHANNELS.map((channel) => ({
    ...parentTemplates[key],
    channel,
  }))
);

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === "string" && NOTIFICATION_CHANNELS.includes(value as NotificationChannel);
}

export function isNotificationTemplateKey(value: unknown): value is NotificationTemplateKey {
  return typeof value === "string" && NOTIFICATION_TEMPLATE_KEYS.includes(value as NotificationTemplateKey);
}

export function defaultTemplateFor(key: NotificationTemplateKey, channel: NotificationChannel) {
  return DEFAULT_NOTIFICATION_TEMPLATES.find((template) => template.key === key && template.channel === channel);
}
