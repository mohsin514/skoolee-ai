import { z } from "zod";
import { hasEmailProviderConfig } from "@/lib/email";
import type { AnnouncementLanguage } from "./announcements";
import { announcementChannelSchema, validChannelContact, type AnnouncementChannel } from "./announcement-channel-contract";
const templateSchema = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), name: z.string().regex(/^[a-z0-9_]{1,128}$/), language: z.enum(["en", "ar", "ur"]), providerLanguage: z.string().regex(/^(en(?:_[A-Z]{2})?|ar|ur(?:_[A-Z]{2})?)$/), subject: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(1024).refine(value => !value.includes("{{")) }).refine(value => value.providerLanguage.split("_")[0] === value.language);
export type AnnouncementTemplate = z.infer<typeof templateSchema>;
export function configuredAnnouncementTemplates(): AnnouncementTemplate[] { try { const source = process.env.WHATSAPP_ANNOUNCEMENT_TEMPLATES_JSON; if (!source || source.length > 100000) return []; const result = z.array(templateSchema).max(30).parse(JSON.parse(source)); return new Set(result.map(item => item.id)).size === result.length ? result : []; } catch { return []; } }
export type ChannelCapability = { channel: AnnouncementChannel; configured: boolean; reason: "OUTBOUND_DISABLED" | "PROVIDER_UNCONFIGURED" | "TEMPLATE_REQUIRED" | null };
export function announcementChannelCapabilities(): ChannelCapability[] {
  const disabled = process.env.DISABLE_OUTBOUND_MESSAGES === "true";
  const sms = /^AC[a-fA-F0-9]{32}$/.test(process.env.TWILIO_ACCOUNT_SID ?? "") && Boolean(process.env.TWILIO_AUTH_TOKEN) && /^MG[a-fA-F0-9]{32}$/.test(process.env.TWILIO_MESSAGING_SERVICE_SID ?? "");
  const whatsapp = /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "") && /^\d+$/.test(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "") && Boolean(process.env.WHATSAPP_ACCESS_TOKEN) && /^v\d{1,2}\.0$/.test(process.env.WHATSAPP_API_VERSION ?? "");
  return announcementChannelSchema.options.map(channel => { const provider = channel === "EMAIL" ? process.env.EMAIL_DEV_MODE !== "true" && hasEmailProviderConfig() : channel === "SMS" ? sms : whatsapp, templates = channel !== "WHATSAPP" || configuredAnnouncementTemplates().length > 0; return { channel, configured: !disabled && provider && templates, reason: disabled ? "OUTBOUND_DISABLED" : !provider ? "PROVIDER_UNCONFIGURED" : !templates ? "TEMPLATE_REQUIRED" : null }; });
}
export type AnnouncementChannelMessage = { channel: AnnouncementChannel; recipient: string; subject: string; body: string; language: AnnouncementLanguage; template?: AnnouncementTemplate };
export type AnnouncementChannelAdapter = (message: AnnouncementChannelMessage) => Promise<{ success: boolean; messageId?: string; error?: string }>;
export function exactAnnouncementTemplate(id: string | undefined, language: string, subject: string, body: string) { return configuredAnnouncementTemplates().find(item => item.id === id && item.language === language && item.subject === subject && item.body === body); }
/** Read-only provider verification is separated from the fenced delivery effect. */
export async function verifyAnnouncementTemplate(template: AnnouncementTemplate, transport: typeof fetch = fetch) {
  if (!announcementChannelCapabilities().find(item => item.channel === "WHATSAPP")?.configured) return false;
  const response = await transport(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?name=${encodeURIComponent(template.name)}&limit=100`, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return false;
  const json = await response.json() as { data?: Array<{ name?: string; status?: string; language?: string; components?: Array<{ type?: string; text?: string }> }> };
  return Boolean(json.data?.some(row => row.name === template.name && row.status === "APPROVED" && row.language === template.providerLanguage && row.components?.length === 1 && row.components[0].type === "BODY" && row.components[0].text === template.body));
}
export async function sendAnnouncementChannel(message: AnnouncementChannelMessage, transport: typeof fetch = fetch) {
  if (!announcementChannelCapabilities().find(item => item.channel === message.channel)?.configured || !validChannelContact(message.channel, message.recipient)) return { success: false, error: "PROVIDER_UNAVAILABLE" };
  if (message.channel === "EMAIL") { const { sendEmailMessage } = await import("@/lib/email"); return sendEmailMessage({ to: message.recipient, subject: message.subject, text: message.body, language: message.language }); }
  if (message.channel === "SMS") {
    if (message.body.length > 1600) return { success: false, error: "MESSAGE_TOO_LONG" };
    const response = await transport(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: message.recipient, MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!, Body: message.body }), redirect: "error", signal: AbortSignal.timeout(15000) });
    const data = await response.json() as { sid?: string }; return response.ok && typeof data.sid === "string" ? { success: true, messageId: data.sid } : { success: false, error: "PROVIDER_REJECTED" };
  }
  const template = message.template && exactAnnouncementTemplate(message.template.id, message.language, message.subject, message.body); if (!template) return { success: false, error: "TEMPLATE_REQUIRED" };
  const response = await transport(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: message.recipient.slice(1), type: "template", template: { name: template.name, language: { code: template.providerLanguage } } }), redirect: "error", signal: AbortSignal.timeout(15000) });
  const data = await response.json() as { messages?: Array<{ id?: string }> }; return response.ok && typeof data.messages?.[0]?.id === "string" ? { success: true, messageId: data.messages[0].id } : { success: false, error: "PROVIDER_REJECTED" };
}
