import assert from "node:assert/strict";
import test from "node:test";
import { boardPublicationRules, contractBoards, curriculumContractSchema, validateContractForPublication } from "../../src/lib/school-ai/curriculum-contract";
import { activationBlockers, catalogueRow, curriculumPackGate, planTransition, type ActivationSnapshot, type PackActor } from "../../src/lib/school-ai/curriculum-pack-registry";
import { ibDpMathematicsAaSlFixture } from "../fixtures/curriculum/ib-dp-mathematics-aa-sl.fixture";

const now = new Date("2026-11-01T00:00:00Z");
const actor = (role: string, userId: string, over: Partial<PackActor> = {}): PackActor => ({ userId, role, schoolId: "qa-uae", campusId: "qa-uae-c1", leadsAcademics: false, ...over });

test("every contract board has a publication rule entry (one table, no scattered board checks)", () => {
  assert.deepEqual(Object.keys(boardPublicationRules).sort(), [...contractBoards].sort());
});

test("a second-market fixture (IB, UAE campus) runs contract → catalogue → activation → gate end to end", () => {
  const contract = curriculumContractSchema.parse(ibDpMathematicsAaSlFixture);
  const row = catalogueRow(contract);
  assert.equal(row.board, "IB");
  assert.equal(row.schoolGrade, "Grade 12");

  const snapshot: ActivationSnapshot = {
    schoolId: "qa-uae", campusId: "qa-uae-c1", status: "DRAFT", geography: "UAE_DUBAI", schoolGrade: "Grade 12", localBudgetApprover: null,
    sourceEvidence: [], educatorApprover: null, educatorApproverId: null, approvedOn: null, reviewDueOn: null, requestedById: "u-admin", contentSha256: row.contentSha256,
  };
  const before = activationBlockers(row, snapshot, now).join(" ");
  assert.match(before, /rights scope/);
  assert.match(before, /budget approver/);

  const evidenced: ActivationSnapshot = { ...snapshot, localBudgetApprover: "Finance lead", sourceEvidence: [{ sourceId: "syn-ib-guide", rightsScope: "Reference only", permissionEvidence: "Synthetic letter 1" }], educatorApprover: "Principal UAE", educatorApproverId: "u-principal", approvedOn: new Date("2026-10-30"), reviewDueOn: new Date("2027-10-30") };
  const principal = actor("PRINCIPAL", "u-principal"), admin = actor("CAMPUS_ADMIN", "u-admin");
  assert.equal(planTransition(snapshot, "APPROVED", principal, [], { approvedOn: "2026-10-30", reviewDueOn: "2027-10-30" }, now).ok, true);
  const approved = { ...evidenced, status: "APPROVED" as const };
  const blockers = activationBlockers(row, approved, now);
  assert.deepEqual(blockers, []);
  assert.equal(planTransition(approved, "ACTIVE", admin, blockers, {}, now).ok, true);

  const gate = curriculumPackGate({ declared: { packId: row.packId, version: 1 }, knownPackIds: new Set([row.packId]), catalogue: row, activation: { ...approved, status: "ACTIVE" }, now });
  assert.deepEqual(gate, { gated: true, allowed: true, pin: { packId: row.packId, version: 1, contentSha256: row.contentSha256 } });
});

test("the new board keeps its own rule and is never mapped onto another board", () => {
  assert.match(validateContractForPublication({ ...ibDpMathematicsAaSlFixture, tier: "Core" }, now).join(" "), /Standard Level/);
  assert.equal(curriculumContractSchema.safeParse({ ...ibDpMathematicsAaSlFixture, board: "UNKNOWN_BOARD" }).success, false);
});
