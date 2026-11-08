import { sourceStructureApprovalIssues } from "./intake";
import type { SourceData } from "./types";

/** Never route a different confidential document through the syllabus-only provider path. */
export function syllabusSourceIssue(data: SourceData): "OUTLINE_NOT_SYLLABUS" | "OUTLINE_REVIEW_REQUIRED" | null {
  if (data.documentKind !== "syllabus") return "OUTLINE_NOT_SYLLABUS";
  if (data.storageKey && (data.mimeType.startsWith("image/") || data.mimeType === "application/pdf") && (!data.sourcePages?.length || !data.structureReviewed)) return "OUTLINE_REVIEW_REQUIRED";
  if (data.extractionStatus === "needs_review" || data.uncertainties?.length || sourceStructureApprovalIssues(data).length) return "OUTLINE_REVIEW_REQUIRED";
  return null;
}
