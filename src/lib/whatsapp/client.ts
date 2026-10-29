// ===========================================
// SkooleeAI - WhatsApp Client (Meta Cloud API)
// ===========================================
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { schoolSender } from "./connection";
import { managedSender, reserve, settle, type Category } from "./managed";
import { sendingAdapter, type SendResult } from "./graph";

interface WhatsAppMessage {
  to: string;
  text: string;
  pdfUrl?: string;
  /** SKAI-1045: the sending school. With a connected WABA the school's own number (and Meta bill) is used. */
  schoolId?: string;
  /** SKAI-1046: Meta pricing category, charged on managed sending. Defaults to UTILITY. */
  category?: Category;
}

/** The legacy platform number from env, kept for schools that use neither their own account nor the add-on. */
function platformSender() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "", token = process.env.WHATSAPP_ACCESS_TOKEN || "";
  return phoneNumberId && token ? { phoneNumberId, token, source: "PLATFORM" as const } : null;
}

/** School-owned WABA first (D3 default), then the Skoolee-managed add-on, then the legacy platform number. */
export async function resolveSender(schoolId?: string) {
  if (schoolId) {
    const chosen = await runWithTenantContext({ schoolId }, async () => {
      const own = await schoolSender(schoolId);
      if (own) return { ...own, source: "SCHOOL_WABA" as const };
      const managed = await managedSender(schoolId);
      return managed ? { ...managed, source: "MANAGED" as const } : null;
    });
    if (chosen) return chosen;
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
    const graph = sendingAdapter(), category = message.category ?? "UTILITY";
    // Managed sending is prepaid: each message reserves credit first and is blocked (never rerouted) without it.
    const send = async (payload: Record<string, unknown>): Promise<SendResult> => {
      if (sender.source !== "MANAGED") return graph.sendMessage(sender.phoneNumberId, sender.token, payload);
      const schoolId = message.schoolId!;
      return runWithTenantContext({ schoolId }, async () => {
        const held = await reserve(schoolId, message.to, category);
        if ("blocked" in held) return { success: false, error: held.blocked };
        const result = await graph.sendMessage(sender.phoneNumberId, sender.token, payload);
        await settle(schoolId, category, held.price, result);
        return result;
      });
    };
    const text = await send({ to: message.to, type: "text", text: { body: message.text } });
    if (!text.success || !message.pdfUrl) return text;
    const document = await send({
      to: message.to, type: "document",
      document: { link: message.pdfUrl, caption: "Report Card", filename: "report-card.pdf" },
    });
    return document.success ? text : { success: false, error: document.error || "WhatsApp text sent, but document delivery failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
