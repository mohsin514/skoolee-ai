import { z } from "zod";
import { contractContentSha256, contractPilotEligibility, curriculumContractSchema, validateContractForPublication, type CurriculumContract } from "./curriculum-contract";
import { evaluatePilotEligibility, pilotEligibilityInputSchema } from "./pilot-eligibility";
import { fbiseGrade9MathematicsPack } from "./packs/fbise-g9-mathematics";
import { ksaIntermediateGrades, ksaIntermediateMathematicsPack, ksaSemesters, type KsaIntermediateGrade } from "./packs/ksa-intermediate-mathematics";
import { buildCambridge0580Pack, type Cambridge0580Component, type Cambridge0580Tier } from "./packs/cambridge-0580-mathematics";

/**
 * SKAI-1008..1012 in the product: the shipped contract packs, the per-school activation lifecycle
 * (DRAFT → APPROVED → ACTIVE, any → REVOKED, revoke terminal) and the gate that Exam Studio and AI
 * paper generation consult. Pure and DB-free; `curriculum-pack-service.ts` persists it.
 *
 * BISE Lahore (SKAI-1010) has no SKAI-1008 contract module yet: its rules live on the curriculum
 * record (`assessment.ts` pack checks), so it is not seeded here and is not invented.
 */
export const ACTIVATION_STATUSES = ["DRAFT", "APPROVED", "ACTIVE", "REVOKED"] as const;
export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];
export const PACK_GEOGRAPHIES = pilotEligibilityInputSchema.shape.geography.options;
export type PackGeography = (typeof PACK_GEOGRAPHIES)[number];

/** Every DRAFT contract the repository ships, in a stable order. */
export function shippedCurriculumPacks(): CurriculumContract[] {
  const ksa = (Object.keys(ksaIntermediateGrades) as KsaIntermediateGrade[]).flatMap(grade => ksaSemesters.map(term => ksaIntermediateMathematicsPack(grade, term)));
  const cambridgeCombos: [Cambridge0580Tier, Cambridge0580Component][] = [["Core", "P1"], ["Core", "P3"], ["Extended", "P2"], ["Extended", "P4"]];
  // One exam year per verified edition, June series; the school records its own grade label on activation.
  const cambridge = ["2027", "2028"].flatMap(examYear => cambridgeCombos.map(([tier, component]) => buildCambridge0580Pack({ examYear, teachingYear: `${Number(examYear) - 1}-${examYear.slice(2)}`, tier, component, schoolGradeLabel: "Year 11", series: "June" })));
  return [fbiseGrade9MathematicsPack, ...ksa, ...cambridge].map(pack => curriculumContractSchema.parse(pack));
}

export type CatalogueRow = { packId: string; version: number; board: string; subject: string; schoolGrade: string; examYear: string; language: string; status: string; contentSha256: string; content: CurriculumContract; unverified: CurriculumContract["unverified"] };

export function catalogueRow(contract: CurriculumContract): CatalogueRow {
  return { packId: contract.packId, version: contract.version, board: contract.board, subject: contract.subject, schoolGrade: contract.gradeMapping.schoolGrade, examYear: contract.examYear, language: contract.language, status: contract.status, contentSha256: contractContentSha256(contract), content: contract, unverified: contract.unverified };
}

const text = (max: number) => z.string().trim().min(1).max(max);
export const sourceEvidenceSchema = z.object({
  sourceId: text(80),
  rightsScope: text(500),
  permissionEvidence: text(500),
  documentKey: text(300).optional(),
  documentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  documentName: text(200).optional(),
}).strict();
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;

export type ActivationSnapshot = {
  schoolId: string; campusId: string; status: ActivationStatus; geography: string; schoolGrade: string;
  localBudgetApprover: string | null; sourceEvidence: SourceEvidence[]; educatorApprover: string | null; educatorApproverId: string | null;
  approvedOn: Date | null; reviewDueOn: Date | null; requestedById: string; contentSha256: string;
};

const iso = (date: Date | null) => date ? date.toISOString().slice(0, 10) : undefined;

/** The catalogue contract with this school's evidence, approver and grade mapping laid over it. */
export function effectiveContract(catalogue: CurriculumContract, activation: ActivationSnapshot): CurriculumContract {
  const evidence = new Map(activation.sourceEvidence.map(item => [item.sourceId, item]));
  return {
    ...catalogue,
    status: activation.status === "APPROVED" || activation.status === "ACTIVE" ? "APPROVED" : activation.status === "REVOKED" ? "REVOKED" : "DRAFT",
    gradeMapping: { ...catalogue.gradeMapping, schoolGrade: activation.schoolGrade },
    sources: catalogue.sources.map(source => {
      const item = evidence.get(source.id);
      return item ? { ...source, rightsScope: item.rightsScope, permissionEvidence: item.permissionEvidence } : source;
    }),
    register: { ...catalogue.register, educatorApprover: activation.educatorApprover ?? undefined, approvedOn: iso(activation.approvedOn), reviewDueOn: iso(activation.reviewDueOn) },
  };
}

/**
 * Every reason this activation cannot be ACTIVE. Empty means the contract checks and the SKAI-1007
 * eligibility gate both pass. Status is evaluated as if approved, so a DRAFT shows what remains.
 */
export function activationBlockers(catalogue: CatalogueRow, activation: ActivationSnapshot, now = new Date()): string[] {
  const errors: string[] = [];
  if (activation.contentSha256 !== catalogue.contentSha256 || contractContentSha256(catalogue.content) !== catalogue.contentSha256) errors.push("The catalogue content no longer matches the version this request pinned. Request the current version.");
  if (activation.status === "REVOKED") errors.push("This activation was revoked. Revocation is final; request the pack again.");
  const contract = effectiveContract(catalogue.content, { ...activation, status: "APPROVED" });
  const known = new Set(catalogue.content.sources.map(source => source.id));
  for (const item of activation.sourceEvidence) if (!known.has(item.sourceId)) errors.push(`Evidence names an unknown source ${item.sourceId}.`);
  errors.push(...validateContractForPublication(contract, now));
  const budget = Boolean(activation.localBudgetApprover?.trim());
  // Geography and the local budget approver are independent of contract evidence: always report them.
  const market = evaluatePilotEligibility({ geography: activation.geography, board: contract.board, grade: contract.gradeMapping.schoolGrade, subject: contract.subject, examYear: contract.examYear, academicYear: contract.teachingYear, term: contract.term, tier: contract.tier, language: contract.language, approvalStatus: "APPROVED", approvedAt: now, localBudgetApprover: budget }, now);
  if (!market.eligible) errors.push(`${market.reason} ${market.nextAction}`);
  if (!errors.length) {
    const eligibility = contractPilotEligibility(contract, activation.geography as PackGeography, budget, now);
    if (!eligibility.eligible) errors.push(`${eligibility.reason} ${eligibility.nextAction}`);
  }
  return [...new Set(errors)];
}

export type PackActor = { userId: string; role: string; schoolId: string; campusId: string | null; leadsAcademics: boolean };

/** Group owner for any campus of the school, or a campus administrator for their own campus. */
export function canManagePackRequest(actor: PackActor, schoolId: string, campusId: string): boolean {
  if (actor.schoolId !== schoolId) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  return (actor.role === "CAMPUS_ADMIN" || actor.role === "ADMIN") && actor.campusId === campusId;
}

/** The campus's educator approver: its principal, or a campus operator while it leads academics. */
export function canApprovePack(actor: PackActor, schoolId: string, campusId: string): boolean {
  if (actor.schoolId !== schoolId || actor.campusId !== campusId) return false;
  return actor.role === "PRINCIPAL" || actor.leadsAcademics;
}

export const approvalInputSchema = z.object({ approvedOn: z.iso.date(), reviewDueOn: z.iso.date() }).strict();

export type TransitionPlan = { ok: true } | { ok: false; status: number; errors: string[] };

export function planTransition(activation: ActivationSnapshot, to: ActivationStatus, actor: PackActor, blockers: string[], input: { approvedOn?: string; reviewDueOn?: string; reason?: string } = {}, now = new Date()): TransitionPlan {
  const manage = canManagePackRequest(actor, activation.schoolId, activation.campusId);
  const approve = canApprovePack(actor, activation.schoolId, activation.campusId);
  if (actor.schoolId !== activation.schoolId) return { ok: false, status: 404, errors: ["Pack request not found."] };
  if (activation.status === "REVOKED") return { ok: false, status: 409, errors: ["A revoked activation cannot change. Request the pack again."] };
  if (to === "REVOKED") {
    if (!manage && !approve) return { ok: false, status: 403, errors: ["Only the campus administrator, group owner or educator approver can revoke."] };
    if (!input.reason?.trim()) return { ok: false, status: 422, errors: ["Give a reason for the revocation."] };
    return { ok: true };
  }
  if (to === "APPROVED") {
    if (activation.status !== "DRAFT") return { ok: false, status: 409, errors: [`Cannot approve a ${activation.status} request.`] };
    if (!approve) return { ok: false, status: 403, errors: ["Only the campus educator approver (principal or academic lead) can approve a curriculum pack."] };
    if (actor.userId === activation.requestedById) return { ok: false, status: 403, errors: ["The approver must be a different person from the requester."] };
    const dates = approvalInputSchema.safeParse({ approvedOn: input.approvedOn, reviewDueOn: input.reviewDueOn });
    if (!dates.success) return { ok: false, status: 422, errors: ["Record the approval date and the review date (YYYY-MM-DD)."] };
    const today = now.toISOString().slice(0, 10);
    if (dates.data.approvedOn > today) return { ok: false, status: 422, errors: ["The approval date cannot be in the future."] };
    if (dates.data.reviewDueOn <= dates.data.approvedOn || dates.data.reviewDueOn <= today) return { ok: false, status: 422, errors: ["The review date must be after the approval date and in the future."] };
    return { ok: true };
  }
  if (to === "ACTIVE") {
    if (activation.status !== "APPROVED") return { ok: false, status: 409, errors: ["Only an approved request can be activated."] };
    if (!manage) return { ok: false, status: 403, errors: ["Only the campus administrator or group owner can activate a pack."] };
    if (blockers.length) return { ok: false, status: 422, errors: blockers };
    return { ok: true };
  }
  return { ok: false, status: 409, errors: [`Cannot move a ${activation.status} request to ${to}.`] };
}

export type DeclaredPack = { packId?: string; version?: number };
export type PackGateInput = {
  declared: DeclaredPack | undefined;
  /** Catalogue pack ids, so a curriculum naming one is always gated even before it is seeded. */
  knownPackIds: Set<string>;
  catalogue: CatalogueRow | null;
  /** ACTIVE activations of this pack version for the paper's school and campus. */
  activation: ActivationSnapshot | null;
  /** Pin already recorded on a paper, if any. */
  pin?: { packId: string; version: number; contentSha256: string } | null;
  now?: Date;
};
export type PackGate = { gated: false } | { gated: true; allowed: true; pin: { packId: string; version: number; contentSha256: string } } | { gated: true; allowed: false; code: "CURRICULUM_PACK_NOT_ACTIVE"; reasons: string[] };

/** Exam Studio and AI paper generation: a catalogue pack must be ACTIVE for this campus, and outputs pin its hash. */
export function curriculumPackGate(input: PackGateInput): PackGate {
  const packId = input.declared?.packId;
  if (!packId || !(input.knownPackIds.has(packId) || input.catalogue)) return { gated: false };
  const blocked = (reasons: string[]): PackGate => ({ gated: true, allowed: false, code: "CURRICULUM_PACK_NOT_ACTIVE", reasons });
  if (!input.declared?.version) return blocked(["The curriculum names a catalogue pack without a version."]);
  if (!input.catalogue) return blocked([`Pack ${packId} version ${input.declared.version} is not in the platform catalogue.`]);
  if (!input.activation || input.activation.status !== "ACTIVE") return blocked([`Pack ${packId} version ${input.declared.version} is not active for this campus. Ask the campus administrator to request it and the educator approver to approve it.`]);
  const blockers = activationBlockers(input.catalogue, input.activation, input.now);
  if (blockers.length) return blocked(blockers);
  const pin = { packId, version: input.catalogue.version, contentSha256: input.catalogue.contentSha256 };
  if (input.pin && (input.pin.packId !== pin.packId || input.pin.version !== pin.version || input.pin.contentSha256 !== pin.contentSha256)) return blocked(["This paper was prepared against a different pack version. Regenerate it against the active version."]);
  return { gated: true, allowed: true, pin };
}
