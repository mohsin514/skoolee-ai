import type { Metadata } from "next";
import { FileText, Languages, ShieldCheck } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "AI Report Cards in Urdu and English",
  description: "Create bilingual AI report card remarks in Urdu and English with principal review, PDF export, and parent communication workflows.",
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["AI report cards Urdu English", "bilingual report cards", "Urdu report card remarks", "school report card software"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "AI report cards in Urdu and English",
        title: "Generate bilingual report card drafts that teachers and principals can trust.",
        description:
          "SkooleeAI turns marks into personalized English and Urdu report card remarks, then routes them through approval before PDFs or parent messages go out.",
        highlights: ["English, Urdu, or both", "Approval required before sharing", "Bulk PDF export on paid plans", "Report status and delivery tracking"],
        sections: [
          { icon: Languages, title: "Bilingual by design", body: "Remarks can be drafted in English, Urdu, or both so schools can communicate clearly with every parent community." },
          { icon: ShieldCheck, title: "Human review", body: "AI creates drafts, not final decisions. Review status, approvals, and principal checks keep sensitive school communication controlled." },
          { icon: FileText, title: "PDF-ready reports", body: "Generate polished report card PDFs after marks are locked and remarks are reviewed, with plan gates for export access." },
        ],
        proof: ["Drafts stay in review until approved.", "PDF export is blocked when the plan does not include it.", "Published report cards can be delivered through approved channels."],
      }}
    />
  );
}
