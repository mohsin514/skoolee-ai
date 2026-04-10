// ===========================================
// SkooleeAI - WhatsApp Client (Meta Cloud API)
// ===========================================

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";

interface WhatsAppMessage {
  to: string;
  text: string;
  pdfUrl?: string;
}

/**
 * Send a text message via WhatsApp Cloud API.
 */
export async function sendWhatsAppMessage(
  message: WhatsAppMessage
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Send text message
    const textResponse = await fetch(
      `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "text",
          text: { body: message.text },
        }),
      }
    );

    if (!textResponse.ok) {
      const err = await textResponse.json();
      return {
        success: false,
        error: err?.error?.message || "Failed to send WhatsApp message",
      };
    }

    const textResult = await textResponse.json();

    // If there's a PDF attachment, send it as a document
    if (message.pdfUrl) {
      await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "document",
          document: {
            link: message.pdfUrl,
            caption: "Report Card",
            filename: "report-card.pdf",
          },
        }),
      });
    }

    return {
      success: true,
      messageId: textResult?.messages?.[0]?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send a report card notification to a parent via WhatsApp.
 */
export async function sendReportCardNotification(
  parentPhone: string,
  studentName: string,
  examName: string,
  pdfUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const text = `📋 Report Card Ready!\n\nDear Parent,\n\nThe report card for *${studentName}* for *${examName}* is now ready.\n\n${
    pdfUrl ? "📎 Download the report card from the attached document." : "Please log in to the portal to view results."
  }\n\n— SkooleeAI`;

  return sendWhatsAppMessage({
    to: parentPhone,
    text,
    pdfUrl,
  });
}
