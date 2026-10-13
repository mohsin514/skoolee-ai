import type { z } from "zod";
import type { CurriculumData, PaperData } from "./assessment";
import type { onboardingDataSchema, sourceDataSchema, workflowDataSchema, policyDataSchema } from "./schemas";

export const WORKSPACE_KINDS = ["ONBOARDING", "SOURCE", "CURRICULUM", "PAPER", "WORKFLOW", "POLICY"] as const;
export type WorkspaceKind = typeof WORKSPACE_KINDS[number];
export type WorkspaceStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
export type OnboardingData = z.infer<typeof onboardingDataSchema>;
export type SourceData = z.infer<typeof sourceDataSchema>;
export type WorkflowData = z.infer<typeof workflowDataSchema>;
export type PolicyData = z.infer<typeof policyDataSchema>;
export type WorkspaceDataMap = {
  ONBOARDING: OnboardingData;
  SOURCE: SourceData;
  CURRICULUM: CurriculumData;
  PAPER: PaperData;
  WORKFLOW: WorkflowData;
  POLICY: PolicyData;
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
