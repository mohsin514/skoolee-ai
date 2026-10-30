/**
 * SKO-500 (SKO-408 slice 1): who approves, moderates and runs the exam office in the exam chain.
 *
 * Pure: every fact the decision needs (the actor's seats, the author's department head, the policy)
 * is resolved by the caller inside its own request and passed in. Nothing here reads the database,
 * the clock or the environment, so the same rules are tested without a database.
 *
 * Slice 1 **widens** approval for Exam Studio records to the head of the author's department and to
 * the teacher under the classroom tier. It does not yet narrow the legacy manager predicate
 * (`isSchoolAiManager`); that enforcement lands in slice 2 (plan §4.8), so existing approval paths keep
 * working unchanged.
 *
 * Skoolee's `Department` has no link to subjects, so "the department that owns the paper" is the
 * author's primary department (`DepartmentMember.isPrimary`), and its head is the default moderator.
 */
import { isSchoolAiManager } from "./access";
import type { DeliveryPolicy, ExamChainPolicyInput } from "./delivery-policy";

export type ClassroomExamType = "QUIZ" | "CLASS_TEST";
export type ExamType = ClassroomExamType | "MID_TERM" | "FINAL";

export interface ExamChainPolicy {
  classroomTier: { enabled: boolean; examTypes: ClassroomExamType[]; maxMarks: number; requiresRehearsal: true; teacherApprovesSyllabus: boolean };
  moderation: { required: boolean; moderatorRule: "DEPARTMENT_HEAD" | "ACADEMIC_LEAD"; authorMayModerate: false };
  sealedBy: "PRINCIPAL" | "HEAD_OF_DEPARTMENT";
  providerConfidentiality: { unreleasedPaperText: "OPT_IN" | "OFF" };
  familyResultsGate: "AFTER_PUBLICATION" | "ON_RELEASE";
  discloseKeyAfterPublication: boolean;
  solverFindings: "BLOCK_DISAGREEMENT" | "ADVISORY";
}

/** The platform defaults (plan §3.1 and §5.3). A school's approved Delivery Policy may override each part. */
export const DEFAULT_EXAM_CHAIN_POLICY: Readonly<ExamChainPolicy> = Object.freeze({
  classroomTier: { enabled: true, examTypes: ["QUIZ", "CLASS_TEST"], maxMarks: 50, requiresRehearsal: true, teacherApprovesSyllabus: true },
  moderation: { required: true, moderatorRule: "DEPARTMENT_HEAD", authorMayModerate: false },
  sealedBy: "PRINCIPAL",
  providerConfidentiality: { unreleasedPaperText: "OPT_IN" },
  familyResultsGate: "AFTER_PUBLICATION",
  discloseKeyAfterPublication: false,
  solverFindings: "BLOCK_DISAGREEMENT",
}) as ExamChainPolicy;

/** The effective chain policy: the platform default, part by part overridden by the school's record. */
export function examChainPolicy(policy: Pick<DeliveryPolicy, "chain"> | { chain?: ExamChainPolicyInput } | null | undefined): ExamChainPolicy {
  const chain = policy?.chain ?? {};
  const base = DEFAULT_EXAM_CHAIN_POLICY;
  return {
    classroomTier: chain.classroomTier ? { ...chain.classroomTier, examTypes: [...chain.classroomTier.examTypes] } : { ...base.classroomTier, examTypes: [...base.classroomTier.examTypes] },
    moderation: chain.moderation ?? { ...base.moderation },
    sealedBy: chain.sealedBy ?? base.sealedBy,
    providerConfidentiality: chain.providerConfidentiality ?? { ...base.providerConfidentiality },
    familyResultsGate: chain.familyResultsGate ?? base.familyResultsGate,
    discloseKeyAfterPublication: chain.discloseKeyAfterPublication ?? base.discloseKeyAfterPublication,
    solverFindings: chain.solverFindings ?? base.solverFindings,
  };
}

/** Kinds whose approval this module decides. Every other kind keeps its existing gate. */
export const EXAM_CHAIN_APPROVAL_KINDS = ["SOURCE", "CURRICULUM", "PAPER", "PRACTICE"] as const;
export type ExamChainApprovalKind = (typeof EXAM_CHAIN_APPROVAL_KINDS)[number];

export interface ApprovalActor {
  userId: string;
  role: string;
  /** The record is in a subject and class the actor teaches (`getAssignedWorkspaceSubjects`). */
  teachesRecordScope: boolean;
  /** The actor heads (HEAD, DEPUTY_HEAD or acting) the author's primary department. */
  headsAuthorDepartment: boolean;
}

export interface ApprovalRecord {
  kind: string;
  createdById: string;
  /** PAPER only. Absent on older papers, which read as CLASS_TEST. */
  examType?: ExamType;
  /** PAPER only: the blueprint total. */
  totalMarks?: number;
}

export type ApprovalAuthority = "MANAGER" | "HEAD_OF_DEPARTMENT" | "CLASSROOM_TIER";
export type ApprovalDecision =
  | { allowed: true; as: ApprovalAuthority }
  | { allowed: false; reason: "NOT_AN_APPROVER" | "TERM_PAPER_NEEDS_SEAL_AUTHORITY" | "ABOVE_CLASSROOM_CEILING" | "TIER_DISABLED" | "OUT_OF_SCOPE" };

export function isClassroomPaper(record: Pick<ApprovalRecord, "examType">): boolean {
  return (record.examType ?? "CLASS_TEST") === "QUIZ" || (record.examType ?? "CLASS_TEST") === "CLASS_TEST";
}

/**
 * May this actor approve this saved version?
 *
 * - A manager (today's rule) may always, so no existing path loses its approver in slice 1.
 * - The head of the author's department may approve the author's SOURCE, CURRICULUM, PRACTICE and
 *   classroom PAPER records; a term PAPER only when the school delegates sealing to the head.
 * - The teacher may approve their own records under the classroom tier: syllabus kinds when
 *   `teacherApprovesSyllabus`, PRACTICE, and classroom papers up to the mark ceiling.
 *
 * Separation of duties (author ≠ approver when the school requires it) stays with
 * `assertApprovalSeparation`, which runs after this decision.
 */
export function mayApprove(actor: ApprovalActor, record: ApprovalRecord, policy: ExamChainPolicy): ApprovalDecision {
  if (isSchoolAiManager({ role: actor.role as Parameters<typeof isSchoolAiManager>[0]["role"] })) return { allowed: true, as: "MANAGER" };
  if (!(EXAM_CHAIN_APPROVAL_KINDS as readonly string[]).includes(record.kind)) return { allowed: false, reason: "NOT_AN_APPROVER" };
  const termPaper = record.kind === "PAPER" && !isClassroomPaper(record);
  if (actor.headsAuthorDepartment && actor.userId !== record.createdById) {
    if (termPaper && policy.sealedBy !== "HEAD_OF_DEPARTMENT") return { allowed: false, reason: "TERM_PAPER_NEEDS_SEAL_AUTHORITY" };
    return { allowed: true, as: "HEAD_OF_DEPARTMENT" };
  }
  if (actor.role !== "TEACHER") return { allowed: false, reason: "NOT_AN_APPROVER" };
  if (!actor.teachesRecordScope) return { allowed: false, reason: "OUT_OF_SCOPE" };
  const tier = policy.classroomTier;
  if (!tier.enabled) return { allowed: false, reason: "TIER_DISABLED" };
  if (record.kind === "SOURCE" || record.kind === "CURRICULUM") return tier.teacherApprovesSyllabus ? { allowed: true, as: "CLASSROOM_TIER" } : { allowed: false, reason: "TIER_DISABLED" };
  if (record.kind === "PRACTICE") return { allowed: true, as: "CLASSROOM_TIER" };
  if (termPaper) return { allowed: false, reason: "TERM_PAPER_NEEDS_SEAL_AUTHORITY" };
  if (!tier.examTypes.includes((record.examType ?? "CLASS_TEST") as ClassroomExamType)) return { allowed: false, reason: "TIER_DISABLED" };
  if ((record.totalMarks ?? 0) > tier.maxMarks) return { allowed: false, reason: "ABOVE_CLASSROOM_CEILING" };
  return { allowed: true, as: "CLASSROOM_TIER" };
}

/**
 * The default moderator of a paper slot: the head of the author's primary department, else the first
 * academic lead who is not the author. The author never moderates their own paper.
 */
export function moderatorFor(input: { authorUserId: string | null; authorDepartmentHeadIds: readonly string[]; academicLeadIds: readonly string[]; rule: ExamChainPolicy["moderation"]["moderatorRule"] }): string | null {
  const notAuthor = (id: string) => id !== input.authorUserId;
  if (input.rule === "DEPARTMENT_HEAD") {
    const head = input.authorDepartmentHeadIds.find(notAuthor);
    if (head) return head;
  }
  return input.academicLeadIds.find(notAuthor) ?? null;
}

/** May this user act as the exam office (schedule, request papers, nudge, record print runs, publish the gradebook)? */
export function isExamOffice(input: { userId: string; isOfficeRole: boolean; examCoordinatorUserId: string | null }): boolean {
  return input.isOfficeRole || (input.examCoordinatorUserId !== null && input.examCoordinatorUserId === input.userId);
}

/** A moderator assignment is valid only when it names someone other than the author. */
export function validModerator(authorUserId: string | null, moderatorUserId: string | null): boolean {
  return moderatorUserId === null || moderatorUserId !== authorUserId;
}
