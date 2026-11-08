"use client";
import { useRef } from "react";
import { Lightbulb, Sparkles } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { StudyAssistant } from "@/components/study/study-assistant";
import { AiActionPanel } from "@/components/role-dashboard";
import { useUiText } from "@/components/locale/LocaleProvider";
import { useStudentData } from "../student-data-context";

/**
 * Study help (SKO-428): explanations grounded in the learner's approved class material, plus the
 * learner's AI tools (explain a report, plan study, ask an approved school question) that used to sit
 * on Today (M99). Primary: Ask a question (focuses the assistant).
 */
export default function StudentStudyPage() {
  const ui = useUiText();
  const { data, refetch } = useStudentData();
  const assistantRef = useRef<HTMLDivElement>(null);
  const studentId = data?.user?.id as string | undefined;

  const studentAIFeatures = [
    { feature: "explain_report_card", label: ui("Explain report"), placeholder: ui("Optional question about the latest report") },
    { feature: "study_plan", label: ui("Study plan"), placeholder: ui("Goal, exam, or available study time") },
    { feature: "school_faq", label: ui("School questions"), field: "question" as const, placeholder: ui("Ask an approved school question") },
  ];

  const focusAssistant = () => {
    const root = assistantRef.current;
    root?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    root?.querySelector<HTMLElement>("textarea, input")?.focus();
  };

  return (
    <StudentPage
      icon={Lightbulb}
      title="Study help"
      description="Explanations from your class material, with sources."
      primaryAction={{ id: "ask", label: "Ask a question", icon: Lightbulb, onClick: focusAssistant }}
    >
      <div className="space-y-6">
        <div ref={assistantRef} className="scroll-mt-4"><StudyAssistant /></div>
        {studentId ? (
          <section aria-labelledby="student-ai-tools" className="sk-panel p-4 sm:p-5">
            <h2 id="student-ai-tools" className="mb-3 flex items-center gap-2 text-base font-bold text-ink-strong">
              <Sparkles aria-hidden="true" className="size-4 text-primary" /> {ui("More ways to get help")}
            </h2>
            <AiActionPanel hideTitle title={ui("More ways to get help")} options={studentAIFeatures} studentId={studentId} compact onComplete={refetch} />
          </section>
        ) : null}
      </div>
    </StudentPage>
  );
}
