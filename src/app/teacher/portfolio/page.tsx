"use client";
import { Sparkles } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { TeacherPortfolio } from "@/components/portfolio/portfolio";

// SKO-427: review learners' portfolios and share approved collections with guardians (a review queue:
// rows carry Approve / Return, so the page has no primary action).
export default function TeacherPortfolioPage() {
  return (
    <TeacherPage icon={Sparkles} title="Portfolios" description="Review learners' reflections and share approved evidence with their families.">
      <TeacherPortfolio />
    </TeacherPage>
  );
}
