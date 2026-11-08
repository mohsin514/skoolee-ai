"use client";
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { Portfolio } from "@/components/portfolio/portfolio";
import { PathwayPanel } from "@/components/pathways/pathway-panel";

/**
 * SKO-427 / SKO-455: Portfolio & goals — the learner's evidence of how their work improved, and the goals
 * they choose to share. The screen's one primary action is "Add evidence" (SPEC §4.4b); the panel's own
 * duplicate button is hidden here.
 */
export default function StudentPortfolioPage() {
  const [addRequest, setAddRequest] = useState(0);
  return (
    <StudentPage
      icon={Sparkles}
      title="Portfolio & goals"
      description="Work, feedback and how you improved it, with the goals you choose to share."
      primaryAction={{ id: "add-evidence", label: "Add evidence", icon: Plus, onClick: () => setAddRequest((n) => n + 1) }}
    >
      <div className="space-y-6">
        <Portfolio addRequest={addRequest} hideAdd />
        <PathwayPanel />
      </div>
    </StudentPage>
  );
}
