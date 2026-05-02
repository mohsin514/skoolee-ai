import type { Metadata } from "next";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "WhatsApp Report Card Software",
  description: "Send approved report card updates to parents on WhatsApp with plan controls, templates, delivery logging, and PDF attachments.",
  keywords: ["WhatsApp report card software", "send report cards on WhatsApp", "parent communication software", "school WhatsApp notifications"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "WhatsApp report card software",
        title: "Send reviewed report cards and parent updates on WhatsApp.",
        description:
          "SkooleeAI connects report card publishing with WhatsApp templates, recipient checks, attachment links, and delivery logs so parent communication is fast and auditable.",
        highlights: ["WhatsApp enabled on paid plans", "Approved-data checks", "Email fallback supported", "Delivery status saved per report card"],
        sections: [
          { icon: MessageCircle, title: "Parent channels", body: "Use parent WhatsApp numbers from student records and keep each communication linked to the student, exam, and report card." },
          { icon: CheckCircle2, title: "Approved before sending", body: "Sensitive templates can require approved school data, preventing draft AI content from being sent too early." },
          { icon: Send, title: "Tracked delivery", body: "Messages record status, provider IDs, missing recipient states, failed reasons, and attachment URLs for operational follow-up." },
        ],
        proof: ["WhatsApp calls are blocked on Free.", "Suspended schools cannot send parent messages.", "Report card delivery updates the student record."],
      }}
    />
  );
}
