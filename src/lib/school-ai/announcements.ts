import { z } from "zod";
import { announcementChannelSchema, type AnnouncementChannel } from "./announcement-channel-contract";
import type { AnnouncementTemplate, ChannelCapability } from "./announcement-channels";

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const announcementLanguageSchema = z.enum(["en", "ar", "ur"]);
const text = z.strictObject({ subject: z.string().min(1).max(180).refine(value => Boolean(value.trim()) && !/[\r\n]/.test(value)), body: z.string().min(1).max(5000).refine(value => Boolean(value.trim())) });
export const announcementProposalSchema = z.strictObject({
  operation: z.literal("communications.queue_announcement"),
  classIds: z.array(id).min(1).max(10).refine(value => new Set(value).size === value.length),
  channel: announcementChannelSchema,
  templateIds: z.strictObject({ en: z.string().max(64).optional(), ar: z.string().max(64).optional(), ur: z.string().max(64).optional() }).optional(),
  messages: z.strictObject({ en: text.optional(), ar: text.optional(), ur: text.optional() }),
  fallbackLanguage: announcementLanguageSchema.nullable(),
}).superRefine((value, ctx) => {
  if (value.channel === "WHATSAPP" && Object.keys(value.messages).some(language => !value.templateIds?.[language as "en" | "ar" | "ur"])) ctx.addIssue({ code: "custom", path: ["templateIds"], message: "Select an exact approved template for each language." });
  if (value.channel === "SMS" && Object.values(value.messages).some(message => message && message.body.length > 1600)) ctx.addIssue({ code: "custom", path: ["messages"], message: "SMS messages must be at most 1,600 characters." });
  if (!Object.keys(value.messages).length) ctx.addIssue({ code: "custom", path: ["messages"], message: "Write at least one exact language variant." });
  if (value.fallbackLanguage && !value.messages[value.fallbackLanguage]) ctx.addIssue({ code: "custom", path: ["fallbackLanguage"], message: "Write the chosen fallback language variant." });
});
export type AnnouncementProposal = z.infer<typeof announcementProposalSchema>;
export type AnnouncementLanguage = z.infer<typeof announcementLanguageSchema>;
export interface AnnouncementOptions {
  campusId: string;
  classes: Array<{ id: string; name: string; section: string | null; academicYear: number }>;
  providerReady: boolean;
  channels?: ChannelCapability[];
  templates?: AnnouncementTemplate[];
}
export interface AnnouncementRecipient {
  guardianUserId: string; name: string; recipient: string; language: AnnouncementLanguage; studentNames: string[];
}
export interface AnnouncementPreview {
  operation: "communications.queue_announcement"; recordId: string; version: number; campusId: string; channel: AnnouncementChannel;
  templateIds?: AnnouncementProposal["templateIds"];
  classes: Array<{ id: string; name: string }>;
  messages: AnnouncementProposal["messages"]; fallbackLanguage: AnnouncementProposal["fallbackLanguage"];
  recipients: AnnouncementRecipient[];
  skipped: Array<{ studentId: string; studentName: string; reason: "NO_VERIFIED_GUARDIAN" | "MISSING_CONTACT" | "NO_COMMUNICATION_PERMISSION" | "CHANNEL_NOT_CONSENTED" }>;
  blockers: Array<"ANNOUNCEMENT_PROVIDER_UNAVAILABLE" | "ANNOUNCEMENT_MISSING_LANGUAGE" | "ANNOUNCEMENT_EMPTY_AUDIENCE" | "ANNOUNCEMENT_CONTACT_CONFLICT" | "ANNOUNCEMENT_TEMPLATE_REQUIRED" | "ANNOUNCEMENT_MESSAGE_TOO_LONG" | "ANNOUNCEMENT_CHANNEL_PLAN">;
  previewHash: string;
}
export interface AnnouncementExecutionReceipt {
  id: string; operation: "communications.queue_announcement"; recordId: string; version: number; status: "COMPLETED";
  queuedCount: number; communicationIds: string[]; completedAt: string;
}
export interface AnnouncementDelivery {
  id: string; recipient: string; language: AnnouncementLanguage;
  status: "QUEUED" | "ACCEPTED" | "DELIVERED" | "READ" | "FAILED" | "UNCERTAIN" | "CANCELLED";
  reason?: string;
}
export interface AnnouncementDeliveryList { deliveries: AnnouncementDelivery[]; counts: Record<AnnouncementDelivery["status"], number> }
