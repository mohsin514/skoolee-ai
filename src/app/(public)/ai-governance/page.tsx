import type { Metadata } from "next";
import { TrustPage } from "../trust-page";

export const metadata: Metadata = {
  title: "AI Governance | SkooleeAI",
  description: "SkooleeAI's approach to AI drafts, credits, review queues, approvals, and school-controlled use.",
};

export default function Page() {
  return (
    <TrustPage
      copy={{
        title: "AI Governance",
        description:
          "AI in SkooleeAI is designed to assist educators, not replace professional judgment. Drafts are logged, limited, and routed through review before sensitive use.",
        sections: [
          { title: "Draft-first AI", body: "AI-generated remarks, insights, and interventions are treated as drafts. The product stores review status and approval fields before final sharing." },
          { title: "Credit limits", body: "Each plan includes monthly AI credits. The application checks and consumes credits in code before generating AI content." },
          { title: "Prompt governance", body: "AI usage logs include feature names, actions, prompt versions, models, token counts, approval status, and metadata for auditing." },
          { title: "Human accountability", body: "Principals and school leaders remain responsible for approving report card remarks, analytics, interventions, and parent-facing communication." },
        ],
      }}
    />
  );
}
