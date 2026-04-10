// ===========================================
// SkooleeAI - AI Prompt Templates
// ===========================================

import { AIRemarkRequest } from "@/types";

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
  const percentage = ((totalObtained / totalMax) * 100).toFixed(1);

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

function getToneInstruction(tone: string): string {
  switch (tone) {
    case "encouraging":
      return "Motivating and uplifting — focus on positives while gently noting improvement areas.";
    case "constructive":
      return "Balanced and actionable — clearly identify strengths and specific areas for growth.";
    case "formal":
    default:
      return "Professional and formal — suitable for official report card communication.";
  }
}
