import { createHash } from "node:crypto";
import { z } from "zod";
import { evaluatePilotEligibility, type EligibilityResult, type PilotEligibilityInput } from "./pilot-eligibility";

/**
 * SKAI-1008 (D2-02): versioned cross-market curriculum contract.
 * This is the specification and verification layer that SKAI-958 board templates consume;
 * it does not generate papers. Each board keeps its own rules and is never mapped onto another.
 */
export const contractBoards = ["FBISE", "BISE_LAHORE", "KSA_MOE", "CAMBRIDGE", "BRITISH_NATIONAL", "IB", "CBSE", "MOE_UAE"] as const;
export type ContractBoard = (typeof contractBoards)[number];

type BoardRule = { test: (c: { tier: string; term: string; examSession: string }) => boolean; error: string };
const pakistanSession: BoardRule = { test: c => /annual/i.test(c.examSession), error: "Pakistan board contracts require a named annual examination session." };
/**
 * SKAI-1106: board-specific publication rules live in one table. A new board is one enum value plus
 * an entry here (empty when it has no extra rule); its pack content is data. Boards never borrow
 * another board's structure.
 */
export const boardPublicationRules: Record<ContractBoard, readonly BoardRule[]> = {
  FBISE: [pakistanSession],
  BISE_LAHORE: [pakistanSession],
  KSA_MOE: [{ test: c => /term|فصل/i.test(c.term), error: "Saudi contracts require a named semester/term." }],
  CAMBRIDGE: [{ test: c => /core|extended/i.test(c.tier), error: "Cambridge contracts require a Core or Extended tier." }],
  BRITISH_NATIONAL: [{ test: c => /foundation|higher/i.test(c.tier), error: "GCSE contracts require a Foundation or Higher tier." }],
  IB: [{ test: c => /\b(SL|HL)\b|standard level|higher level/i.test(c.tier), error: "IB contracts require a Standard Level (SL) or Higher Level (HL) tier." }],
  CBSE: [],
  MOE_UAE: [{ test: c => /term/i.test(c.term), error: "UAE Ministry of Education contracts require a named term." }],
};
export const contractStatuses = ["DRAFT", "IN_REVIEW", "APPROVED", "SUPERSEDED", "REVOKED"] as const;
export type ContractStatus = (typeof contractStatuses)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const contractSourceSchema = z.object({
  id: text(80),
  kind: z.enum(["NOTICE", "SYLLABUS", "SCHEME_OF_STUDIES", "ASSESSMENT_FRAMEWORK", "TABLE_OF_SPECIFICATION", "MODEL_PAPER", "PAST_PAPER", "TEXTBOOK"]),
  authority: text(200),
  reference: text(200),
  issuedOn: isoDate.optional(),
  edition: text(120),
  url: z.string().url(),
  retrievedOn: isoDate,
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  applicability: text(500),
  /** What the school may do with the source; absent means rights are unverified. */
  rightsScope: text(500).optional(),
  permissionEvidence: text(500).optional(),
}).strict();

export const paperSectionSchema = z.object({
  id: text(40),
  format: z.enum(["MCQ", "SHORT", "LONG", "PRACTICAL"]),
  marks: z.number().positive(),
  questionCount: z.number().int().positive(),
  attempt: z.number().int().positive(),
}).strict();

export const curriculumContractSchema = z.object({
  packId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  version: z.number().int().positive(),
  status: z.enum(contractStatuses),
  board: z.enum(contractBoards),
  qualification: text(120),
  examSession: text(80),
  examYear: z.string().regex(/^\d{4}$/),
  teachingYear: z.string().regex(/^\d{4}-\d{2}$/),
  gradeMapping: z.object({ boardLevel: text(40), schoolGrade: text(40) }).strict(),
  term: text(80),
  subject: text(80),
  tier: text(80),
  language: z.enum(["en", "ar", "ur"]),
  outcomes: z.array(z.object({ code: text(40), statement: text(500), assessed: z.boolean() }).strict()).max(500),
  paper: z.object({
    totalMarks: z.number().positive().optional(),
    durationMinutes: z.number().int().positive().optional(),
    sections: z.array(paperSectionSchema).max(12),
    calculator: z.enum(["ALLOWED", "NOT_ALLOWED", "UNVERIFIED"]),
    rules: z.array(text(500)).max(20),
  }).strict(),
  sources: z.array(contractSourceSchema).min(1).max(30),
  register: z.object({
    educatorApprover: text(120).optional(),
    approvedOn: isoDate.optional(),
    reviewDueOn: isoDate.optional(),
    reviewTrigger: text(300),
  }).strict(),
  /** Named evidence requests. Any entry blocks publication and pilot activation. */
  unverified: z.array(z.object({ field: text(80), evidenceRequest: text(500) }).strict()).max(50),
}).strict();
export type CurriculumContract = z.infer<typeof curriculumContractSchema>;

const day = (now: Date) => now.toISOString().slice(0, 10);

/** Returns every reason the contract cannot be published. Empty means publishable. */
export function validateContractForPublication(raw: unknown, now = new Date()): string[] {
  const parsed = curriculumContractSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join(".") || "contract"}: ${issue.message}`);
  const c = parsed.data;
  const errors: string[] = [];
  for (const item of c.unverified) errors.push(`Unverified ${item.field}: ${item.evidenceRequest}`);
  if (Number(c.examYear) < Number(c.teachingYear.slice(0, 4))) errors.push("Exam year cannot precede the teaching year.");
  if (!c.sources.some(source => source.kind !== "PAST_PAPER" && source.kind !== "MODEL_PAPER")) errors.push("Past and model papers are structural references only; cite an authoritative notice, syllabus or framework.");
  for (const source of c.sources) if (!source.rightsScope || !source.permissionEvidence) errors.push(`Source ${source.id} has no verified rights scope and permission evidence.`);
  const editions = new Map<string, string>();
  // Notices and papers are separate documents; a curriculum document kind must have one edition.
  for (const source of c.sources.filter(item => !["NOTICE", "PAST_PAPER", "MODEL_PAPER"].includes(item.kind))) {
    const key = `${source.kind}:${source.authority}`;
    const seen = editions.get(key);
    if (seen && seen !== source.edition) errors.push(`Conflicting ${source.kind} editions (${seen} vs ${source.edition}); resolve with a qualified educator.`);
    editions.set(key, source.edition);
  }
  if (!c.register.educatorApprover || !c.register.approvedOn) errors.push("An educator approver and approval date are required.");
  if (!c.register.reviewDueOn) errors.push("A review/expiry date is required.");
  else if (c.register.reviewDueOn <= day(now)) errors.push("The contract edition is stale; review the sources and approve a new version.");
  if (!c.outcomes.some(outcome => outcome.assessed)) errors.push("At least one assessed learning outcome is required.");
  if (!c.paper.totalMarks || !c.paper.durationMinutes) errors.push("Total marks and duration are required.");
  if (!c.paper.sections.length) errors.push("At least one paper section is required.");
  for (const section of c.paper.sections) if (section.attempt > section.questionCount) errors.push(`Section ${section.id} asks for more answers than questions offered.`);
  const sectionMarks = c.paper.sections.reduce((sum, section) => sum + section.marks, 0);
  if (c.paper.totalMarks && c.paper.sections.length && sectionMarks !== c.paper.totalMarks) errors.push(`Section marks (${sectionMarks}) do not equal the paper total (${c.paper.totalMarks}).`);
  if (c.paper.calculator === "UNVERIFIED") errors.push("Calculator rule is unverified.");
  for (const rule of boardPublicationRules[c.board]) if (!rule.test(c)) errors.push(rule.error);
  return errors;
}

export type ContractActor = { userId: string; schoolId: string; canApproveCurriculum: boolean };
export type ContractAuditEntry = { packId: string; version: number; from: ContractStatus; to: ContractStatus; actorId: string; schoolId: string; at: string };

const transitions: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["IN_REVIEW"], IN_REVIEW: ["DRAFT", "APPROVED"], APPROVED: ["SUPERSEDED", "REVOKED"], SUPERSEDED: ["REVOKED"], REVOKED: [],
};

/** Auditable, authorized lifecycle. Approved content is immutable: change means a new version. */
export function transitionContract(contract: CurriculumContract, to: ContractStatus, actor: ContractActor, now = new Date()):
  { ok: true; contract: CurriculumContract; audit: ContractAuditEntry } | { ok: false; errors: string[] } {
  if (!transitions[contract.status].includes(to)) return { ok: false, errors: [`Cannot move a ${contract.status} contract to ${to}.`] };
  if ((to === "APPROVED" || to === "REVOKED" || to === "SUPERSEDED") && !actor.canApproveCurriculum) return { ok: false, errors: ["Only a curriculum approver can approve, supersede or revoke a contract."] };
  if (to === "APPROVED") {
    const errors = validateContractForPublication(contract, now);
    if (errors.length) return { ok: false, errors };
  }
  return { ok: true, contract: { ...contract, status: to }, audit: { packId: contract.packId, version: contract.version, from: contract.status, to, actorId: actor.userId, schoolId: actor.schoolId, at: now.toISOString() } };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export type ContractPin = { packId: string; version: number; contentSha256: string };

/** Assessment output stores this pin; later defaults or versions never rewrite it. */
export function pinContract(contract: CurriculumContract): ContractPin {
  if (contract.status !== "APPROVED") throw new Error("Only an approved contract version can be pinned to assessment output.");
  return { packId: contract.packId, version: contract.version, contentSha256: contractContentSha256(contract) };
}

/** Content hash of a contract version; status is excluded so approval does not change identity. */
export function contractContentSha256(contract: CurriculumContract): string {
  const { status: _status, ...content } = contract;
  return createHash("sha256").update(canonical(content)).digest("hex");
}

export function pinMatches(pin: ContractPin, contract: CurriculumContract): boolean {
  return pin.packId === contract.packId && pin.version === contract.version && pin.contentSha256 === contractContentSha256(contract);
}

export type ContractRequest = { board: ContractBoard; schoolGrade: string; subject: string; examYear: string; tier?: string; language: "en" | "ar" | "ur" };

/** Exact match only: a request for one board, grade, year, tier or language is never served by another. */
export function contractMismatches(contract: CurriculumContract, request: ContractRequest): string[] {
  const errors: string[] = [];
  if (contract.board !== request.board) errors.push(`Contract is for ${contract.board}, not ${request.board}.`);
  if (contract.gradeMapping.schoolGrade !== request.schoolGrade) errors.push(`Contract maps grade ${contract.gradeMapping.schoolGrade}, not ${request.schoolGrade}.`);
  if (contract.subject.toLowerCase() !== request.subject.toLowerCase()) errors.push(`Contract subject is ${contract.subject}.`);
  if (contract.examYear !== request.examYear) errors.push(`Contract exam year is ${contract.examYear}, not ${request.examYear}.`);
  if (request.tier && contract.tier !== request.tier) errors.push(`Contract tier is ${contract.tier}.`);
  if (contract.language !== request.language) errors.push(`Contract language is ${contract.language}.`);
  return errors;
}

/** Feeds the SKAI-1007 eligibility gate; unverified evidence keeps the capability off. */
export function contractPilotEligibility(contract: CurriculumContract, geography: PilotEligibilityInput["geography"], localBudgetApprover = false, now = new Date()): EligibilityResult {
  const errors = validateContractForPublication(contract, now);
  if (errors.length) return { eligible: false, reason: "The curriculum contract has unverified or invalid evidence.", nextAction: errors[0] };
  return evaluatePilotEligibility({
    geography, board: contract.board, grade: contract.gradeMapping.schoolGrade, subject: contract.subject, examYear: contract.examYear,
    academicYear: contract.teachingYear, term: contract.term, tier: contract.tier, language: contract.language, approvalStatus: contract.status,
    approvedAt: contract.register.approvedOn, reviewDueAt: contract.register.reviewDueOn, localBudgetApprover,
  }, now);
}
