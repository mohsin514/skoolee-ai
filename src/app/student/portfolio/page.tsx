"use client";
import { Sparkles } from "lucide-react";
import { StudentPage } from "@/components/student/student-page";
import { Portfolio } from "@/components/portfolio/portfolio";

// SKO-427: the learner's own portfolio.
export default function StudentPortfolioPage() {
  return <StudentPage tone="classes" icon={Sparkles} eyebrow="Learning" title="My portfolio" summary="Work, feedback and how you improved it"><Portfolio /></StudentPage>;
}
