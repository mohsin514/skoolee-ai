import type { Metadata } from "next";
import { BarChart3, BrainCircuit, TrendingUp } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "AI Student Performance Analytics",
  description: "Use AI student performance analytics for class summaries, at-risk student insights, campus comparisons, and intervention planning.",
  alternates: { canonical: "https://skooleeai.com/" },
  keywords: ["AI student performance analytics", "school analytics software", "at-risk student insights", "AI education analytics"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "AI student performance analytics",
        title: "Spot academic patterns early with AI-supported school analytics.",
        description:
          "SkooleeAI helps principals and owners summarize class performance, compare campuses, identify students needing attention, and create intervention drafts for review.",
        highlights: ["Analytics enabled on Pro and Enterprise", "AI review queues", "Campus and class insight prompts", "Credit limits by plan"],
        sections: [
          { icon: TrendingUp, title: "Performance trends", body: "Turn marks, exams, report cards, and attendance context into focused summaries for school leaders." },
          { icon: BrainCircuit, title: "AI draft insights", body: "Generate at-risk student, class comparison, intervention, weak campus, and academic trend drafts with review tracking." },
          { icon: BarChart3, title: "Plan controlled", body: "Analytics access is enforced in the dashboard, and AI usage is limited by monthly credits for each subscription tier." },
        ],
        proof: ["Free and Basic analytics are blocked gracefully.", "Pro unlocks the analytics dashboard.", "AI credit limits prevent runaway usage."],
      }}
    />
  );
}
