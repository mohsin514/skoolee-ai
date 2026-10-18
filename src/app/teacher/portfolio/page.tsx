"use client";
import { Sparkles } from "lucide-react";
import { TeacherPage } from "@/components/teacher/teacher-page";
import { TeacherPortfolio } from "@/components/portfolio/portfolio";

// SKO-427: review learners' portfolios and share approved collections with guardians.
export default function TeacherPortfolioPage() {
  return <TeacherPage tone="students" icon={Sparkles} eyebrow="Learning" title="Portfolios" summary="Review reflections and share approved evidence"><TeacherPortfolio /></TeacherPage>;
}
