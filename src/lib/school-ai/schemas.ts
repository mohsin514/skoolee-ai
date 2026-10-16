import { extractedPageSchema,documentStructureSchema } from "./intake";
import { knowledgeSchema } from "./knowledge";
import { schoolSetupProposalSchema } from "./school-setup";
import { schoolOperationsProposalSchema } from "./school-operations";
import { financeOperationProposalSchema } from "./finance-operations";
import { automationPolicySchema } from "./runs";
import { z } from "zod";
import { curriculumDataSchema, paperDataSchema } from "./assessment";
import { assessmentBriefSchema } from "./assessment-brief";
import { deliveryPolicySchema } from "./delivery-policy";
import { academicSetupProposalSchema } from "./academic-setup";
import { timetableSetupProposalSchema } from "./timetable-setup";
import { announcementProposalSchema } from "./announcements";
import { examSessionPlanProposalSchema } from "./exam-session-plan";
import { feeInvoiceProposalSchema } from "./fee-invoices";
import { WORKSPACE_KINDS } from "./types";

/** Derived from the one kind list in `./types`, so the enum cannot drift from it. */
export const workspaceKindSchema = z.enum(WORKSPACE_KINDS);
export const workspaceStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"]);
export const workspaceIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
export const ONBOARDING_ANSWER_KEYS = ["schoolName", "country", "timezone", "campuses", "grades", "academicYear", "startDate", "endDate", "workingDays", "firstOutcome", "curriculum", "assessmentPolicy", "feePolicy", "communications", "resources", "staff", "students", "migrationSource"] as const;
const answerKey = z.enum(ONBOARDING_ANSWER_KEYS);
export const onboardingDataSchema = z.strictObject({
  path: z.enum(["new", "import", "migrate"]),
  answers: z.partialRecord(answerKey, z.string().max(4000)),
  confirmedKeys: z.array(answerKey).max(ONBOARDING_ANSWER_KEYS.length),
  step: z.enum(["profile", "academics", "people", "policies", "review"]),
  currentQuestion: z.enum(["path", ...ONBOARDING_ANSWER_KEYS]).optional(),
}).superRefine((value, ctx) => {
  if (new Set(value.confirmedKeys).size !== value.confirmedKeys.length) ctx.addIssue({ code: "custom", path: ["confirmedKeys"], message: "A fact can be confirmed only once." });
  for (const key of value.confirmedKeys) if (!value.answers[key]?.trim()) ctx.addIssue({ code: "custom", path: ["confirmedKeys"], message: `Enter ${key} before confirming it.` });
});

export const sourceDataSchema = z.strictObject({
  extractedText: z.string().max(80000),
  documentKind: z.enum(["syllabus", "paper", "register", "policy", "answer_script", "fee_sheet", "timetable", "staff_list", "other"]),
  fileName: z.string().max(255),
  mimeType: z.string().max(120),
  sourcePages: z.array(extractedPageSchema).max(200).optional(),
  ...documentStructureSchema.shape,
  subjectId: workspaceIdSchema.optional(),
  classId: workspaceIdSchema.optional(),
  origin: z.enum(["manual", "upload", "camera", "voice"]).optional(),
  extractionStatus: z.enum(["manual", "extracted", "needs_review"]).optional(),
  uncertainties: z.array(z.string().max(1000)).max(100).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  storageKey: z.string().min(1).max(1000).optional(),
  extractionModel: z.string().max(120).optional(),
  extractedAt: z.iso.datetime().optional(),
  sourceLanguage: z.enum(["en", "ar", "ur"]).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.subjectId) !== Boolean(value.classId)) ctx.addIssue({ code: "custom", path: ["subjectId"], message: "Choose both the subject and its class." });
  if (value.sourcePages && new Set(value.sourcePages.map((page) => page.page)).size !== value.sourcePages.length) ctx.addIssue({ code: "custom", path: ["sourcePages"], message: "Source page numbers must be unique." });
});

export const workflowModuleSchema = z.enum(["school", "academics", "curriculum", "assessment", "students", "fees", "finance", "payroll", "leave", "attendance", "timetable", "exams", "reports", "staff", "admissions", "accounts", "ai", "library", "front-desk", "transport", "inventory", "dormitory", "communications"]);
export const workflowDataSchema = z.strictObject({
  goal: z.string().trim().min(1).max(4000),
  steps: z.array(z.strictObject({ id: workspaceIdSchema, title: z.string().trim().min(1).max(500), status: z.enum(["proposed", "blocked", "ready"]), module: workflowModuleSchema.optional() })).max(30),
  sourceIds: z.array(workspaceIdSchema).max(40),
  missingInformation: z.array(z.string().max(1000)).max(50),
  subjectId: workspaceIdSchema.optional(),
  classId: workspaceIdSchema.optional(),
  proposal: z.union([schoolSetupProposalSchema, schoolOperationsProposalSchema, financeOperationProposalSchema, academicSetupProposalSchema, timetableSetupProposalSchema, announcementProposalSchema, examSessionPlanProposalSchema, feeInvoiceProposalSchema]).optional(),
}).superRefine((value, ctx) => {
  if (new Set(value.steps.map((step) => step.id)).size !== value.steps.length) ctx.addIssue({ code: "custom", path: ["steps"], message: "Workflow step IDs must be unique." });
  if (Boolean(value.subjectId) !== Boolean(value.classId)) ctx.addIssue({ code: "custom", path: ["subjectId"], message: "Choose both the subject and its class." });
  if (value.proposal && (value.subjectId || value.classId)) ctx.addIssue({ code: "custom", path: ["proposal"], message: "Operational proposals use their typed campus and class scope; do not add a separate subject scope." });
});
export const policyDataSchema = z.strictObject({
  mode: z.enum(["draft_only", "approval_required"]),
  instructions: z.string().max(12000),
  scope: z.enum(["academics", "finance", "communications", "school"]),
  requiresApproval: z.literal(true),
  automation: automationPolicySchema.optional(),
  knowledge: knowledgeSchema.optional(),
}).refine(value => !value.knowledge || !value.automation && value.instructions === value.knowledge.value && value.mode === "approval_required", "Facts and preferences require explicit review and cannot contain automatic actions.").refine(value => !value.automation?.enabled || value.mode === "approval_required", "Scheduled actions require reviewed approval mode.");

/**
 * `PRACTICE` is registered as a record kind before its body is designed, so the placeholder below
 * is deliberately **narrow rather than permissive**: it accepts the teaching scope
 * `assertWorkspaceSubject` reads and refuses every other key, so the kind cannot become an untyped
 * bag of JSON while its owner is outstanding. Its real schema is the Practice_Set schema in
 * `src/lib/school-ai/recovery.ts` (SKO-408 task 23.x), which its owner swaps in below.
 *
 * `BRIEF` has landed: its body is `assessmentBriefSchema` in `src/lib/school-ai/assessment-brief.ts`
 * (SKO-408 task 5.1), which carries the same paired `subjectId`/`classId` teaching scope the
 * placeholder did, so the kind, its role gating and its permission module in `./access` are
 * unchanged by the swap.
 */
const placeholderScopeOnlySchema = z.strictObject({
  subjectId: workspaceIdSchema.optional(),
  classId: workspaceIdSchema.optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.subjectId) !== Boolean(value.classId)) ctx.addIssue({ code: "custom", path: ["subjectId"], message: "Choose both the subject and its class." });
});
export const briefDataSchema = assessmentBriefSchema;
export const practiceDataSchema = placeholderScopeOnlySchema;

/** Discriminated input validation prevents arbitrary bags of JSON becoming trusted workflow state. */
export const workspaceDataSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ONBOARDING"), data: onboardingDataSchema }),
  z.strictObject({ kind: z.literal("SOURCE"), data: sourceDataSchema }),
  z.strictObject({ kind: z.literal("CURRICULUM"), data: curriculumDataSchema }),
  z.strictObject({ kind: z.literal("PAPER"), data: paperDataSchema }),
  z.strictObject({ kind: z.literal("WORKFLOW"), data: workflowDataSchema }),
  z.strictObject({ kind: z.literal("POLICY"), data: policyDataSchema }),
  // The Delivery Policy body is owned by `./delivery-policy`, which also owns the pure decisions
  // over it. Stored here it inherits the whole record chain with no migration (R12.2, R12.3).
  z.strictObject({ kind: z.literal("DELIVERY_POLICY"), data: deliveryPolicySchema }),
  // The Assessment Brief body is owned by `./assessment-brief`, which also owns the pure decisions
  // over it. Stored here it inherits the whole record chain with no migration (R3.9, R3.13).
  z.strictObject({ kind: z.literal("BRIEF"), data: briefDataSchema }),
  z.strictObject({ kind: z.literal("PRACTICE"), data: practiceDataSchema }),
]);

const jsonObject = z.record(z.string(), z.unknown());
export const createWorkspaceSchema = z.strictObject({
  kind: workspaceKindSchema,
  title: z.string().trim().min(1).max(180),
  campusId: workspaceIdSchema.nullable().optional(),
  data: jsonObject,
  idempotencyKey: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});
export const updateWorkspaceSchema = z.strictObject({
  version: z.number().int().min(1).max(2147483646),
  title: z.string().trim().min(1).max(180).optional(),
  data: jsonObject.optional(),
  action: z.enum(["save", "review", "approve", "archive"]).default("save"),
}).superRefine((value, ctx) => {
  if (value.action !== "save" && (value.title !== undefined || value.data !== undefined)) ctx.addIssue({ code: "custom", message: "Save changes before approving or archiving that saved version." });
  if (value.action === "save" && value.title === undefined && value.data === undefined) ctx.addIssue({ code: "custom", message: "Provide a title or data to save." });
});

export const MAX_WORKSPACE_BODY_BYTES = 512 * 1024;
export function parseWorkspaceData(kind: z.infer<typeof workspaceKindSchema>, data: unknown): Record<string, unknown> {
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_WORKSPACE_BODY_BYTES) throw Object.assign(new Error("Workspace data exceeds the 512 KB limit."), { status: 413 });
  return workspaceDataSchema.parse({ kind, data }).data as Record<string, unknown>;
}
