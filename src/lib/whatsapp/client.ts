// ===========================================
// SkooleeAI - WhatsApp Client (Meta Cloud API)
// ===========================================
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { schoolSender } from "./connection";
import { sendingAdapter, type SendResult } from "./graph";

interface WhatsAppMessage {
  to: string;
  text: string;
  pdfUrl?: string;
  /** SKAI-1045: the sending school. With a connected WABA the school's own number (and Meta bill) is used. */
  schoolId?: string;
}

/** The legacy platform number from env, kept for schools that have not connected their own account. */
function platformSender() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "", token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  return phoneNumberId && token ? { phoneNumberId, token, source: "PLATFORM" as const } : null;
}

export async function resolveSender(schoolId?: string) {
  if (schoolId) {
    const own = await runWithTenantContext({ schoolId }, () => schoolSender(schoolId));
    if (own) return { ...own, source: "SCHOOL_WABA" as const };
  }
  return platformSender();
}

/**
 * Send a text message (and optional PDF document) via WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<SendResult> {
  try {
    if (process.env.DISABLE_OUTBOUND_MESSAGES === "true") return { success: false, error: "Outbound messages are disabled" };
    const sender = await resolveSender(message.schoolId);
    if (!sender) return { success: false, error: "WhatsApp credentials are not configured" };
    const graph = sendingAdapter();
    const text = await graph.sendMessage(sender.phoneNumberId, sender.token, { to: message.to, type: "text", text: { body: message.text } });
    if (!text.success || !message.pdfUrl) return text;
    const document = await graph.sendMessage(sender.phoneNumberId, sender.token, {
      to: message.to, type: "document",
      document: { link: message.pdfUrl, caption: "Report Card", filename: "report-card.pdf" },
    });
    return document.success ? text : { success: false, error: document.error || "WhatsApp text sent, but document delivery failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
