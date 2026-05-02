import type { Metadata } from "next";
import { BarChart3, Brain, School } from "lucide-react";
import { ProductPage } from "../product-page";

export const metadata: Metadata = {
  title: "AI School Management Software",
  description: "SkooleeAI helps schools manage students, marks, fees, report cards, WhatsApp communication, and AI performance insights from one dashboard.",
  keywords: ["AI school management software", "school ERP", "AI report cards", "SkooleeAI"],
};

export default function Page() {
  return (
    <ProductPage
      copy={{
        eyebrow: "AI school management software",
        title: "Run academic, fee, and parent workflows from one AI-ready school platform.",
        description:
          "SkooleeAI brings student records, classes, marks, report cards, fee invoices, WhatsApp updates, and human-reviewed AI drafts into a single school operating system.",
        highlights: ["Free plan for small schools", "Stripe upgrades built in", "Human review before AI output is shared", "Pakistan-ready academic workflows"],
        sections: [
          { icon: School, title: "Academic operations", body: "Create campuses, classes, subjects, students, exams, marks, and report cards with role-based access for owners, admins, principals, and teachers." },
          { icon: Brain, title: "AI assistance", body: "Generate draft remarks, performance summaries, intervention ideas, and review queues while keeping school leaders in control." },
          { icon: BarChart3, title: "Market-ready SaaS", body: "Plan limits, billing status, AI credits, PDF export, WhatsApp access, and analytics are controlled by subscription." },
        ],
        proof: ["Trial, active, and suspended states are enforced.", "Plans cover students, teachers, campuses, AI credits, WhatsApp, PDF, and analytics.", "Trust pages explain privacy, AI governance, security, and review policy."],
      }}
    />
  );
}
