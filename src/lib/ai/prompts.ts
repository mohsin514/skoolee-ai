import type { AIRemarkRequest } from "@/types";
import type { UserRole } from "@/lib/roles";

export const AI_PROMPT_VERSION = "phase4-ai-v1";

export const AI_FEATURES = [
  "generate_remarks",
  "rewrite_remark",
  "translate_remark",
  "weak_topics",
  "homework_suggestions",
  "lesson_plan",
  "at_risk_students",
  "class_performance_summary",
  "teacher_class_comparison",
  "intervention_suggestions",
  "pending_review_queue",
  "campus_comparison",
  "weak_campuses",
  "ai_usage_by_campus",
  "fee_recovery_insights",
  "academic_trend_summary",
  "explain_report_card",
  "study_plan",
  "school_faq",
] as const;

export type AIFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AIFeature, string> = {
  generate_remarks: "Generate student remarks",
  rewrite_remark: "Rewrite remark",
  translate_remark: "Translate remark",
  weak_topics: "Weak topic suggestions",
  homework_suggestions: "Homework suggestions",
  lesson_plan: "Lesson plan draft",
  at_risk_students: "At-risk student detection",
  class_performance_summary: "Class performance summary",
  teacher_class_comparison: "Teacher and class comparison",
  intervention_suggestions: "Intervention suggestions",
  pending_review_queue: "Pending review queue",
  campus_comparison: "Campus comparison",
  weak_campuses: "Weak campus detection",
  ai_usage_by_campus: "AI usage by campus",
  fee_recovery_insights: "Fee recovery insights",
  academic_trend_summary: "Academic trend summary",
  explain_report_card: "Report card explanation",
  study_plan: "Study plan",
  school_faq: "Approved school FAQ answer",
};

const ROLE_FEATURES: Record<UserRole, AIFeature[]> = {
  TEACHER: [
    "generate_remarks",
    "rewrite_remark",
    "translate_remark",
    "weak_topics",
    "homework_suggestions",
    "lesson_plan",
  ],
  PRINCIPAL: [
    "at_risk_students",
    "class_performance_summary",
    "teacher_class_comparison",
    "intervention_suggestions",
    "pending_review_queue",
    "generate_remarks",
    "rewrite_remark",
    "translate_remark",
  ],
  SUPER_ADMIN: [
    "campus_comparison",
    "weak_campuses",
    "ai_usage_by_campus",
    "fee_recovery_insights",
    "academic_trend_summary",
    "at_risk_students",
    "class_performance_summary",
    "pending_review_queue",
  ],
  CAMPUS_ADMIN: [
    "at_risk_students",
    "class_performance_summary",
    "teacher_class_comparison",
    "intervention_suggestions",
    "pending_review_queue",
    "generate_remarks",
    "rewrite_remark",
    "translate_remark",
  ],
  ADMIN: [
    "at_risk_students",
    "class_performance_summary",
    "teacher_class_comparison",
    "intervention_suggestions",
    "pending_review_queue",
    "generate_remarks",
    "rewrite_remark",
    "translate_remark",
  ],
  STUDENT: ["explain_report_card", "study_plan", "school_faq"],
  PARENT: ["explain_report_card", "study_plan", "school_faq"],
};

export function canUseAIFeature(role: UserRole, feature: AIFeature) {
  return ROLE_FEATURES[role]?.includes(feature) ?? false;
}

export function featuresForRole(role: UserRole) {
  return ROLE_FEATURES[role] ?? [];
}

export function featureNeedsHumanApproval(feature: AIFeature) {
  return feature === "generate_remarks" || feature === "intervention_suggestions";
}

/**
 * Build the prompt string for generating report card remarks.
 */
export function buildRemarkPrompt(request: AIRemarkRequest): string {
  const subjectLines = request.subjects
    .map(
      (s) =>
        `- ${s.name}: ${s.marksObtained}/${s.maxMarks} (Grade: ${s.grade})`
    )
    .join("\n");

  const totalObtained = request.subjects.reduce(
    (sum, s) => sum + s.marksObtained,
    0
  );
  const totalMax = request.subjects.reduce((sum, s) => sum + s.maxMarks, 0);
  const percentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : "0.0";

  const toneInstruction = getToneInstruction(request.tone || "formal");

  if (request.language === "both") {
    return `
Write a report card remark for the following student in BOTH English and Urdu.
Separate the two with "---" on its own line.

Student: ${request.studentName}
Class: ${request.className}
Overall: ${totalObtained}/${totalMax} (${percentage}%)

Subjects:
${subjectLines}

Tone: ${toneInstruction}

Format:
[English remark here]
---
[Urdu remark here in Urdu script]
`.trim();
  }

  const languageLabel = request.language === "ur" ? "Urdu (in Urdu script)" : "English";

  return `
Write a report card remark in ${languageLabel} for:

Student: ${request.studentName}
Class: ${request.className}
Overall: ${totalObtained}/${totalMax} (${percentage}%)

Subjects:
${subjectLines}

Tone: ${toneInstruction}

Write a concise 2-3 sentence remark.
`.trim();
}

export function buildAIFeaturePrompt({
  role,
  feature,
  context,
  input,
}: {
  role: UserRole;
  feature: AIFeature;
  context: unknown;
  input?: Record<string, unknown>;
}) {
  const label = AI_FEATURE_LABELS[feature];
  const system = [
    "You are SkooleeAI, a school assistant for Pakistani school operations.",
    "Draft helpful, concise outputs for a human school user to review.",
    "Never present sensitive decisions as final. Use draft language for interventions, risk flags, remarks, and administrative decisions.",
    "Only use the provided school-scoped context. If the context is insufficient, say what is missing instead of guessing.",
    "Do not mention or infer data from any other school or campus.",
  ].join(" ");

  const roleInstruction = getRoleFeatureInstruction(role, feature);
  const user = `
Role: ${role}
Feature: ${label}
Prompt version: ${AI_PROMPT_VERSION}

Instructions:
${roleInstruction}

User input:
${JSON.stringify(input || {}, null, 2)}

School-scoped context:
${JSON.stringify(context, null, 2)}
`.trim();

  return { system, user, title: label };
}

function getRoleFeatureInstruction(role: UserRole, feature: AIFeature) {
  switch (feature) {
    case "rewrite_remark":
      return "Rewrite the provided remark in the selected tone. Keep facts unchanged. Return only the rewritten draft.";
    case "translate_remark":
      return "Translate the provided remark between English and Urdu. Preserve meaning and names. Return only the translated draft.";
    case "weak_topics":
      return "Identify likely weak topics from marks and subject patterns. Include evidence and teacher-friendly next steps.";
    case "homework_suggestions":
      return "Suggest short, practical homework for weak students. Keep it age appropriate and focused on recoverable gaps.";
    case "lesson_plan":
      return "Draft a lesson plan with objectives, warm-up, teaching steps, practice, assessment, and homework.";
    case "at_risk_students":
      return "Flag students who may need attention using marks, attendance, fee, and report-card context. This is a draft review queue, not a final decision.";
    case "class_performance_summary":
      return "Summarize class performance, strengths, weak subjects, and recommended follow-up actions.";
    case "teacher_class_comparison":
      return "Compare teachers/classes using the supplied academic data only. Avoid blame; frame as coaching and support opportunities.";
    case "intervention_suggestions":
      return "Draft an intervention plan with goals, owners, timeline, and review checkpoints. Mark it as requiring approval.";
    case "pending_review_queue":
      return "Summarize pending human review items, including report remarks awaiting approval and likely priority order.";
    case "campus_comparison":
      return "Compare campuses using academic, fee, usage, and operational data. Do not expose student-level details.";
    case "weak_campuses":
      return "Identify campuses that may need support. Provide evidence and draft support actions.";
    case "ai_usage_by_campus":
      return "Summarize AI usage patterns by campus and suggest governance improvements.";
    case "fee_recovery_insights":
      return "Summarize fee recovery risks and draft non-punitive follow-up actions.";
    case "academic_trend_summary":
      return "Summarize academic trends across available exams and campuses.";
    case "explain_report_card":
      return "Explain the report card in simple language for a student or parent. Be encouraging and avoid final judgments.";
    case "study_plan":
      return "Create a simple study plan from the student's marks and weak areas. Keep it practical and time-bounded.";
    case "school_faq":
      return "Answer only from the approved FAQ context. If the answer is not present, say that the school has not approved an answer for that question yet.";
    case "generate_remarks":
    default:
      return `Draft the requested ${role.toLowerCase()} AI output. Keep it concise, auditable, and approval-aware.`;
  }
}

function getToneInstruction(tone: string): string {
  switch (tone) {
    case "encouraging":
      return "Motivating and uplifting - focus on positives while gently noting improvement areas.";
    case "constructive":
      return "Balanced and actionable - clearly identify strengths and specific areas for growth.";
    case "formal":
    default:
      return "Professional and formal - suitable for official report card communication.";
  }
}
