import type { Metadata } from "next";
import { TrustPage } from "../trust-page";

export const metadata: Metadata = {
  title: "Human Review Policy | SkooleeAI",
  description: "How SkooleeAI keeps educators in charge of AI drafts, report card remarks, analytics, and parent communication.",
  alternates: { canonical: "https://app.skooleeai.com/human-review-policy" },
};

export default function Page() {
  return (
    <TrustPage
      copy={{
        title: "Human Review Policy",
        description:
          "SkooleeAI is built around the principle that school leaders review and approve sensitive outputs before they affect students or parents.",
        sections: [
          { title: "Report cards", body: "AI remarks must be reviewed and approved before report cards are marked reviewed, published, exported, or sent." },
          { title: "Parent communication", body: "Sensitive notification templates can require approved school data before messages are sent through WhatsApp or email." },
          { title: "Analytics", body: "AI insights and intervention suggestions are presented as decision-support drafts for educators, not automated judgments." },
          { title: "Audit trail", body: "Review queues, approval status, created-by fields, timestamps, and communication logs help schools trace how outputs moved from draft to action." },
        ],
      }}
    />
  );
}
