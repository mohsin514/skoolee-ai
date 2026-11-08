import type { z } from "zod";
import type { CurriculumData, PaperData } from "./assessment";
import type { DeliveryPolicy } from "./delivery-policy";
import type { briefDataSchema, onboardingDataSchema, practiceDataSchema, sourceDataSchema, workflowDataSchema, policyDataSchema } from "./schemas";

/**
 * The single source of truth for the record kinds. `workspaceKindSchema` and the discriminated
 * `workspaceDataSchema` in `./schemas` are both derived from this list, and `allowedWorkspaceKinds`
 * in `./access` gates it by role, so a kind cannot exist in one of the three and not the others.
 *
 * `DELIVERY_POLICY`, `BRIEF` and `PRACTICE` were added by SKO-408. `SchoolAiRecord.kind` is a plain
 * `String` column, so all three are a code-only change with **no migration**, and each inherits
 * versioning, `APPROVED` status, immutable `SchoolAiRevision` snapshots, campus scoping,
 * compare-and-set on version and audit logging from the existing record chain (R25.1–R25.4, R25.9).
 */
export const WORKSPACE_KINDS = ["ONBOARDING", "SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "POLICY", "DELIVERY_POLICY", "BRIEF", "PRACTICE"] as const;
export type WorkspaceKind = typeof WORKSPACE_KINDS[number];
export type WorkspaceStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
export type OnboardingData = z.infer<typeof onboardingDataSchema>;
export type SourceData = z.infer<typeof sourceDataSchema>;
export type WorkflowData = z.infer<typeof workflowDataSchema>;
export type PolicyData = z.infer<typeof policyDataSchema>;
/** Placeholder bodies until their owning tasks land. See the note beside them in `./schemas`. */
export type BriefData = z.infer<typeof briefDataSchema>;
export type PracticeData = z.infer<typeof practiceDataSchema>;
export type WorkspaceDataMap = {
  ONBOARDING: OnboardingData;
  SOURCE: SourceData;
  CURRICULUM: CurriculumData;
  PAPER: PaperData;
  WORKFLOW: WorkflowData;
  POLICY: PolicyData;
  DELIVERY_POLICY: DeliveryPolicy;
  BRIEF: BriefData;
  PRACTICE: PracticeData;
};

/** The same persisted artifact is edited by a form, a conversation, or an AI proposal. */
export interface AiWorkspaceRecord<K extends WorkspaceKind = WorkspaceKind> {
  id: string;
  kind: K;
  title: string;
  campusId: string | null;
  version: number;
  status: WorkspaceStatus;
  data: WorkspaceDataMap[K] & Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export type SchoolAiRecord<K extends WorkspaceKind = WorkspaceKind> = AiWorkspaceRecord<K>;
export interface WorkspaceRevision {
  id: string;
  recordId: string;
  version: number;
  action: "CREATE" | "SAVE" | "REVIEW" | "APPROVE" | "ARCHIVE";
  title: string;
  status: WorkspaceStatus;
  data: Record<string, unknown>;
  actorId: string;
  createdAt: string;
}
export interface WorkspaceCapabilities {
  role: string;
  campusId: string | null;
  canCreate: boolean;
  canApprove: boolean;
  canArchive: boolean;
  canImportRoster?: boolean;
  kinds: WorkspaceKind[];
  campuses: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string; classId: string; className: string; campusId: string }>;
  profile?: { schoolName: string; timezone: string; campuses: string; grades?: string; academicYear?: string };
  setupDefaults?: Partial<Record<"schoolName" | "timezone" | "campuses" | "grades" | "academicYear" | "startDate" | "endDate", string>>;
  /** Approval saves an approved artifact. It never publishes domain records or sends messages. */
  execution: "DRAFTS_ONLY" | "EXPLICIT_TOOLS_ONLY";
  tools?: Array<{ operation: "curriculum.import_topics"; kind: "CURRICULUM" } | { operation: "timetable.publish_reviewed" | "operations.record_risk_decision" | "setup.apply_changes" | "academics.transition_year" | "students.promote_enrollment" | "finance.apply_operation" | "timetable.create_school_drafts" | "attendance.record_register" | "timetable.assign_substitutes" | "academics.setup_year" | "timetable.create_draft" | "communications.queue_announcement" | "exams.create_session_plan" | "fees.generate_invoices"; kind: "WORKFLOW" }>;
}

export interface WorkspaceCreateInput {
  kind: WorkspaceKind;
  title: string;
  campusId?: string | null;
  data: Record<string, unknown>;
  idempotencyKey: string;
}
export interface WorkspaceUpdateInput {
  version: number;
  title?: string;
  data?: Record<string, unknown>;
  action?: "save" | "review" | "approve" | "archive";
}
