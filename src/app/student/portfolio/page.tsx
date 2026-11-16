"use client";
import { useEffect, useState } from "react";
import { Plus, Sparkles, UserRoundX } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { Portfolio } from "@/components/portfolio/portfolio";
import { PathwayPanel } from "@/components/pathways/pathway-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { useUiText } from "@/components/locale/LocaleProvider";
/**
 * SKO-427 / SKO-455: Portfolio & goals — the learner's evidence of how their work improved, and the goals
 * they choose to share. The screen's one primary action is "Add evidence" (SPEC §4.4b); the panel's own
 * duplicate button is hidden here.
 * SKAI-2083: a learner account with no linked pupil record gets a calm "not linked yet" state (no Add evidence)
 * instead of two 404 error cards.
 */
export default function StudentPortfolioPage() {
  const ui = useUiText();
  const [addRequest, setAddRequest] = useState(0);
  const [linked, setLinked] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    // Only a 404 means "no record"; any other failure falls through to the panels' own error states.
    fetch("/api/portfolio", { cache: "no-store" }).then((r) => { if (live) setLinked(r.status !== 404); }, () => { if (live) setLinked(true); });
    return () => { live = false; };
  }, []);
  return (
    <StudentPage
      icon={Sparkles}
      title="Portfolio & goals"
      description="Work, feedback and how you improved it, with the goals you choose to share."
      primaryAction={linked ? { id: "add-evidence", label: "Add evidence", icon: Plus, onClick: () => setAddRequest((n) => n + 1) } : undefined}
    >
      {linked === false ? (
        <div data-pf-not-linked><EmptyState icon={UserRoundX} title={ui("Your student record is not linked yet")} description={ui("Your school has not linked your account to a student record. Ask your teacher or school office for help.")} /></div>
      ) : linked ? (
        <div className="space-y-6">
          <Portfolio addRequest={addRequest} hideAdd />
          <PathwayPanel />
        </div>
      ) : null}
    </StudentPage>
  );
}
