import type { CapabilityEntry } from "./types";

/**
 * Exam Studio owns syllabus → paper → moderation → seal → datesheet, and its own approvals
 * (exam-authority.mayApprove). AI Workflows never duplicates that chain: any registry entry touching
 * those keys may only deep-link into /ai/studio (lint 14, design-slices §9).
 */
const OWNED = /^(studio\.|exam_studio\.|syllabus\.|papers?\.|exams\.(paper|seal|datesheet|principal_review|moderation|item|blueprint|release_results))/;

export const isExamStudioOwned = (key: string) => OWNED.test(key);

/** A problem message when an entry would act on Exam Studio's chain instead of linking to it; null when fine. */
export function examStudioViolation(entry: CapabilityEntry): string | null {
  const owned = [entry.key, ...entry.inventoryKeys].filter(isExamStudioOwned);
  if (!owned.length) return null;
  if (entry.class === "C" && entry.handoff.kind === "DEEP_LINK") return null;
  return `${entry.key}: touches Exam Studio-owned ${owned.join(", ")}; only a class C DEEP_LINK into /ai/studio is allowed`;
}
