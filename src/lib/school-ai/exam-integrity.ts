import { z } from "zod";

export const INTEGRITY_EVENT_KINDS = ["PAGE_HIDDEN", "PAGE_VISIBLE", "WINDOW_BLURRED", "WINDOW_FOCUSED", "CAMERA_STARTED", "CAMERA_ENDED", "CAMERA_UNAVAILABLE", "CAPTURE_UPLOAD_FAILED"] as const;
export const INTEGRITY_EVENT_LIMIT = 600;
export const INTEGRITY_NOTICE_VERSION = "exam-observations-v1";
// Product bound, not a legal retention recommendation. No duration is preselected.
export const INTEGRITY_RETENTION_MAX_DAYS = 365;
const enabledPolicy = z.object({ enabled: z.literal(true), retentionDays: z.number().int().min(1).max(INTEGRITY_RETENTION_MAX_DAYS), policyReference: z.string().trim().min(3).max(200) }).strict();
export const integrityPolicyInputSchema = z.discriminatedUnion("enabled", [z.object({ enabled: z.literal(false) }).strict(), enabledPolicy]);
export const integrityPolicySchema = z.discriminatedUnion("enabled", [z.object({ enabled: z.literal(false) }).strict(), enabledPolicy.extend({ approvedById: z.string().min(1).max(100), approvedAt: z.iso.datetime(), noticeVersion: z.literal(INTEGRITY_NOTICE_VERSION) }).strict()]);
export const integrityPolicyUpdateSchema = z.object({ version: z.number().int().positive(), policy: integrityPolicyInputSchema }).strict();
export type ExamIntegrityPolicy = z.infer<typeof integrityPolicySchema>;
export type ExamIntegrityDisclosure = { enabled: false } | { enabled: true; retentionDays: number; noticeVersion: typeof INTEGRITY_NOTICE_VERSION };
/** Missing, malformed and unapproved policies are all off, including legacy assignments. */
export function examIntegrityPolicy(proctorPolicy: unknown): ExamIntegrityPolicy {
  const value = proctorPolicy && typeof proctorPolicy === "object" && "integrity" in proctorPolicy ? proctorPolicy.integrity : undefined;
  const parsed = integrityPolicySchema.safeParse(value);
  return parsed.success ? parsed.data : { enabled: false };
}
export function examIntegrityDisclosure(proctorPolicy: unknown): ExamIntegrityDisclosure {
  const policy = examIntegrityPolicy(proctorPolicy);
  return policy.enabled ? { enabled: true, retentionDays: policy.retentionDays, noticeVersion: policy.noticeVersion } : { enabled: false };
}
export function integrityRetentionUntil(deadlineAt: Date, policy: ExamIntegrityPolicy): Date | null {
  return policy.enabled ? new Date(deadlineAt.getTime() + policy.retentionDays * 86400000) : null;
}
export const integrityDetailsSchema = z.object({ reason: z.enum(["PERMISSION_DENIED", "DEVICE_UNAVAILABLE", "TRACK_ENDED", "NETWORK", "UPLOAD_REJECTED", "UNKNOWN"]).optional() }).strict();
export const integrityEventSchema = z.object({ attemptId: z.string().min(1).max(100), clientEventId: z.string().uuid(), kind: z.enum(INTEGRITY_EVENT_KINDS), observedAt: z.iso.datetime(), details: integrityDetailsSchema.default({}) }).strict();
export const integrityReviewSchema = z.object({ eventId: z.string().min(1).max(100), version: z.number().int().positive(), decision: z.enum(["DISMISSED", "NOTED", "FOLLOW_UP"]), reason: z.string().trim().min(3).max(2000) }).strict();
export type IntegrityEventKind = typeof INTEGRITY_EVENT_KINDS[number];
export type IntegrityDecision = z.infer<typeof integrityReviewSchema>["decision"];
export type ExamIntegrityView = {
  events: Array<{ id: string; attemptId: string; kind: IntegrityEventKind; observedAt: string; receivedAt: string; retentionUntil: string; details: z.infer<typeof integrityDetailsSchema>; version: number; decision: string; reviewReason: string | null; reviewedAt: string | null; student: { fullName: string; rollNo: string | null } | null }>;
  summary: { total: number; pending: number; followUp: number; truncated: boolean };
  canReview: boolean;
  nextCursor: string | null;
  policy: ExamIntegrityPolicy;
  policyVersion: number;
  canConfigurePolicy: boolean;
};

/** Browser observations can be spoofed or caused by assistive tools/device failure. */
export const INTEGRITY_UNCERTAINTY = "Browser-reported observation, not verified misconduct. Review context and speak with the learner before any decision.";
