import type { WorkspaceKind, WorkspaceStatus, WorkspaceUpdateInput } from "./types";
import { SchoolAiError } from "./access";
import { ONBOARDING_ANSWER_KEYS, onboardingDataSchema, policyDataSchema, sourceDataSchema, workflowDataSchema } from "./schemas";
import { curriculumDataSchema, validateCurriculumApproval } from "./assessment";

/** Approval applies only to a previously saved version. Saving an approved artifact starts a new draft. */
export function nextWorkspaceStatus(current: { version: number; status: WorkspaceStatus }, update: WorkspaceUpdateInput): WorkspaceStatus {
  if (current.version !== update.version) throw new SchoolAiError("This item changed while you were reviewing it. Reload the current version before continuing.", 409);
  if (current.status === "ARCHIVED") throw new SchoolAiError("Archived items are read-only. Create a new draft to continue.", 409);
  const action = update.action ?? "save";
  if (action !== "save" && (update.data !== undefined || update.title !== undefined)) throw new SchoolAiError("Save changes before approving or archiving that saved version.", 400);
  if (action === "archive") return "ARCHIVED";
  if (action === "review") {
    if (current.status !== "DRAFT") throw new SchoolAiError("Only a draft can be submitted for review.", 409);
    return "IN_REVIEW";
  }
  if (action === "approve") {
    if (current.status === "APPROVED") throw new SchoolAiError("This version is already approved.", 409);
    return "APPROVED";
  }
  return "DRAFT";
}

export const TRUSTED_SOURCE_FIELDS = ["storageKey", "sha256", "extractionModel", "extractedAt", "sourceLanguage"] as const;
export type TrustedSourceMetadata = Partial<Record<typeof TRUSTED_SOURCE_FIELDS[number], string>>;
export function protectSourceMetadata(next: Record<string, unknown>, previous?: Record<string, unknown>, trusted?: TrustedSourceMetadata): Record<string, unknown> {
  const result = { ...next };
  for (const key of TRUSTED_SOURCE_FIELDS) {
    if (previous) {
      if (next[key] !== undefined && next[key] !== previous[key]) throw new SchoolAiError("The original source metadata cannot be changed. Add a new source instead.", 400);
      if (previous[key] !== undefined) result[key] = previous[key];
    } else if (trusted?.[key] !== undefined) result[key] = trusted[key];
    else if (next[key] !== undefined) throw new SchoolAiError("Source storage and extraction metadata must be created by the authenticated intake service.", 400);
  }
  return result;
}

/** Readiness errors describe draft approval only. No domain writes are implied. */
export function workspaceApprovalIssues(kind: WorkspaceKind, data: Record<string, unknown>): string[] {
  if (kind === "ONBOARDING") {
    const value = onboardingDataSchema.parse(data);
    const required = ["schoolName", "country", "timezone", "campuses", "grades", "academicYear", "startDate", "endDate", "workingDays", "firstOutcome"] as const;
    const issues = required.filter((key) => !value.answers[key]?.trim() || !value.confirmedKeys.includes(key)).map((key) => `Confirm ${key} before approving the setup draft.`);
    const start = value.answers.startDate;
    const end = value.answers.endDate;
    if (start && end && (!validDate(start) || !validDate(end) || start > end)) issues.push("Enter valid start and end dates in chronological order (YYYY-MM-DD).");
    if (value.answers.timezone) {
      try { new Intl.DateTimeFormat("en", { timeZone: value.answers.timezone }); } catch { issues.push("Choose a valid IANA time zone."); }
    }
    if (value.path !== "new" && !value.answers.migrationSource?.trim()) issues.push("Identify the existing records before approving an import or migration plan.");
    return issues;
  }
  if (kind === "SOURCE") {
    const value = sourceDataSchema.parse(data);
    const issues: string[] = [];
    if (!value.extractedText.trim()) issues.push("Add readable source text before approval.");
    if (value.extractionStatus === "needs_review" || value.uncertainties?.length) issues.push("Resolve and clear the extraction uncertainties before approval.");
    return issues;
  }
  if (kind === "CURRICULUM") return validateCurriculumApproval(curriculumDataSchema.parse(data));
  if (kind === "POLICY") {
    const value = policyDataSchema.parse(data);
    return value.instructions.trim() ? [] : ["Describe the policy before approval."];
  }
  if (kind === "WORKFLOW") {
    const value = workflowDataSchema.parse(data);
    const issues = value.missingInformation.map((item) => `Missing information: ${item}`);
    if (!value.steps.length) issues.push("Add a proposed step before approving the plan.");
    for (const step of value.steps) if (step.status === "blocked") issues.push(`Resolve the blocker: ${step.title}`);
    return issues;
  }
  return []; // PAPER also needs its permission-checked curriculum revision; the repository validates both.
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function missingOnboardingFacts(data: Record<string, unknown>) {
  const value = onboardingDataSchema.parse(data);
  return ONBOARDING_ANSWER_KEYS.filter((key) => !value.answers[key]?.trim());
}
