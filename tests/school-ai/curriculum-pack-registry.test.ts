import assert from "node:assert/strict";
import test from "node:test";
import { contractContentSha256, type CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";
import {
  activationBlockers, canApprovePack, canManagePackRequest, catalogueRow, curriculumPackGate, effectiveContract, planTransition, shippedCurriculumPacks,
  type ActivationSnapshot, type PackActor,
} from "../../src/lib/school-ai/curriculum-pack-registry";

// Synthetic contract: values are test fixtures, not curriculum facts. Rights/approver come from the school's activation.
const synthetic = (): CurriculumContract => ({
  packId: "synthetic-board-g9-maths", version: 1, status: "DRAFT", board: "BISE_LAHORE", qualification: "Synthetic SSC", examSession: "First Annual",
  examYear: "2027", teachingYear: "2026-27", gradeMapping: { boardLevel: "SSC-I", schoolGrade: "9" }, term: "Annual", subject: "Mathematics", tier: "Core", language: "en",
  outcomes: [{ code: "SYN-1", statement: "Synthetic outcome", assessed: true }],
  paper: { totalMarks: 60, durationMinutes: 120, sections: [{ id: "A", format: "MCQ", marks: 20, questionCount: 20, attempt: 20 }, { id: "B", format: "LONG", marks: 40, questionCount: 6, attempt: 4 }], calculator: "NOT_ALLOWED", rules: ["Synthetic rule"] },
  sources: [{ id: "s1", kind: "SYLLABUS", authority: "Synthetic Board", reference: "SYN/1", edition: "2027", url: "https://example.test/syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "a".repeat(64), applicability: "QA schools" }],
  register: { reviewTrigger: "New board notice" },
  unverified: [],
});
const now = new Date("2026-11-01T00:00:00Z");
const row = catalogueRow(synthetic());
const draft = (over: Partial<ActivationSnapshot> = {}): ActivationSnapshot => ({
  schoolId: "school-a", campusId: "campus-a1", status: "DRAFT", geography: "PAKISTAN_LAHORE", schoolGrade: "9", localBudgetApprover: null,
  sourceEvidence: [], educatorApprover: null, educatorApproverId: null, approvedOn: null, reviewDueOn: null, requestedById: "u-admin-a1", contentSha256: row.contentSha256, ...over,
});
const evidenced = (over: Partial<ActivationSnapshot> = {}) => draft({ sourceEvidence: [{ sourceId: "s1", rightsScope: "Reference only", permissionEvidence: "Board letter 12" }], educatorApprover: "Principal A1", educatorApproverId: "u-principal-a1", approvedOn: new Date("2026-10-30"), reviewDueOn: new Date("2027-10-30"), ...over });

const actor = (role: string, schoolId = "school-a", campusId: string | null = "campus-a1", over: Partial<PackActor> = {}): PackActor => ({ userId: `u-${role.toLowerCase()}-${schoolId}-${campusId}`, role, schoolId, campusId, leadsAcademics: false, ...over });

test("every shipped pack is a unique, schema-valid DRAFT and stays blocked by its own unverified items", () => {
  const packs = shippedCurriculumPacks();
  assert.equal(new Set(packs.map(pack => `${pack.packId}@${pack.version}`)).size, packs.length);
  assert.ok(packs.some(pack => pack.board === "FBISE") && packs.some(pack => pack.board === "KSA_MOE") && packs.some(pack => pack.board === "CAMBRIDGE"));
  for (const pack of packs) {
    assert.equal(pack.status, "DRAFT");
    const catalogue = catalogueRow(pack);
    assert.equal(catalogue.contentSha256, contractContentSha256(pack));
    const blockers = activationBlockers(catalogue, { ...evidenced({ contentSha256: catalogue.contentSha256, schoolGrade: pack.gradeMapping.schoolGrade }), sourceEvidence: pack.sources.map(source => ({ sourceId: source.id, rightsScope: "x", permissionEvidence: "y" })) }, now);
    if (pack.unverified.length) assert.ok(blockers.some(item => item.startsWith("Unverified")), `${pack.packId} must stay blocked`);
  }
});

test("the shipped catalogue hashes are stable (seed is idempotent)", () => {
  assert.deepEqual(shippedCurriculumPacks().map(pack => contractContentSha256(pack)), shippedCurriculumPacks().map(pack => contractContentSha256(pack)));
});

test("school evidence and approver complete a synthetic contract; nothing else is inferred", () => {
  assert.match(activationBlockers(row, draft(), now).join(" "), /rights scope/);
  assert.match(activationBlockers(row, draft(), now).join(" "), /educator approver/);
  assert.deepEqual(activationBlockers(row, evidenced(), now), []);
  assert.equal(effectiveContract(row.content, evidenced()).sources[0].rightsScope, "Reference only");
});

test("geography, budget approver, stale review, hash drift and unknown sources block activation", () => {
  assert.match(activationBlockers(row, evidenced({ geography: "PAKISTAN_KARACHI" }), now).join(" "), /outside the approved pilot scope/);
  assert.match(activationBlockers(row, evidenced({ geography: "UAE_DUBAI" }), now).join(" "), /budget approver/);
  assert.deepEqual(activationBlockers(row, evidenced({ geography: "UAE_DUBAI", localBudgetApprover: "Finance lead" }), now), []);
  assert.match(activationBlockers(row, evidenced({ reviewDueOn: new Date("2026-10-31") }), now).join(" "), /stale/);
  assert.match(activationBlockers(row, evidenced({ contentSha256: "b".repeat(64) }), now).join(" "), /no longer matches/);
  assert.match(activationBlockers(row, evidenced({ sourceEvidence: [{ sourceId: "ghost", rightsScope: "x", permissionEvidence: "y" }] }), now).join(" "), /unknown source/);
});

test("permissions: requesters and approvers per role, campus and school", () => {
  assert.equal(canManagePackRequest(actor("SUPER_ADMIN", "school-a", null), "school-a", "campus-a2"), true, "group owner: any campus");
  assert.equal(canManagePackRequest(actor("CAMPUS_ADMIN"), "school-a", "campus-a1"), true);
  assert.equal(canManagePackRequest(actor("CAMPUS_ADMIN"), "school-a", "campus-a2"), false, "campus admin: own campus only");
  assert.equal(canManagePackRequest(actor("SUPER_ADMIN", "school-b", null), "school-a", "campus-a1"), false, "another school's owner");
  for (const role of ["PRINCIPAL", "TEACHER", "ACCOUNTANT", "PARENT", "STUDENT", "APP_OWNER"]) assert.equal(canManagePackRequest(actor(role), "school-a", "campus-a1"), false, role);
  assert.equal(canApprovePack(actor("PRINCIPAL"), "school-a", "campus-a1"), true);
  assert.equal(canApprovePack(actor("PRINCIPAL", "school-a", "campus-a2"), "school-a", "campus-a1"), false);
  assert.equal(canApprovePack(actor("PRINCIPAL", "school-b", "campus-a1"), "school-a", "campus-a1"), false, "two schools never cross");
  assert.equal(canApprovePack(actor("SUPER_ADMIN", "school-a", "campus-a1"), "school-a", "campus-a1"), false, "the group owner is not the educator approver");
  assert.equal(canApprovePack(actor("CAMPUS_ADMIN", "school-a", "campus-a1", { leadsAcademics: true }), "school-a", "campus-a1"), true, "a campus operator while it leads academics");
  assert.equal(canApprovePack(actor("TEACHER"), "school-a", "campus-a1"), false);
});

test("lifecycle: DRAFT → APPROVED (other person, dates) → ACTIVE (no blockers) → REVOKED (terminal, reason)", () => {
  const principal = actor("PRINCIPAL"), admin = { ...actor("CAMPUS_ADMIN"), userId: "u-admin-a1" };
  const dates = { approvedOn: "2026-10-30", reviewDueOn: "2027-10-30" };
  assert.equal(planTransition(draft(), "APPROVED", principal, [], dates, now).ok, true);
  assert.deepEqual(planTransition(draft(), "APPROVED", admin, [], dates, now), { ok: false, status: 403, errors: ["Only the campus educator approver (principal or academic lead) can approve a curriculum pack."] });
  assert.match(JSON.stringify(planTransition(draft(), "APPROVED", { ...admin, leadsAcademics: true }, [], dates, now)), /different person/);
  assert.match(JSON.stringify(planTransition(draft(), "APPROVED", principal, [], {}, now)), /approval date/);
  assert.match(JSON.stringify(planTransition(draft(), "APPROVED", principal, [], { approvedOn: "2026-12-01", reviewDueOn: "2027-12-01" }, now)), /future/);
  assert.match(JSON.stringify(planTransition(draft(), "ACTIVE", admin, [], {}, now)), /Only an approved/);
  assert.match(JSON.stringify(planTransition(evidenced({ status: "APPROVED" }), "ACTIVE", admin, ["Unverified x"], {}, now)), /Unverified x/);
  assert.equal(planTransition(evidenced({ status: "APPROVED" }), "ACTIVE", admin, [], {}, now).ok, true);
  assert.equal(planTransition(evidenced({ status: "APPROVED" }), "ACTIVE", principal, [], {}, now).ok, false, "approver does not self-activate");
  assert.match(JSON.stringify(planTransition(evidenced({ status: "ACTIVE" }), "REVOKED", admin, [], {}, now)), /reason/);
  assert.equal(planTransition(evidenced({ status: "ACTIVE" }), "REVOKED", principal, [], { reason: "Board notice changed" }, now).ok, true);
  for (const to of ["APPROVED", "ACTIVE", "REVOKED"] as const) assert.match(JSON.stringify(planTransition(evidenced({ status: "REVOKED" }), to, admin, [], { reason: "x", ...dates }, now)), /revoked/i);
  assert.equal(planTransition(draft(), "APPROVED", actor("PRINCIPAL", "school-b"), [], dates, now).ok, false, "another school sees not-found");
});

test("the generation/publication gate fails closed and pins the approved hash", () => {
  const known = new Set([row.packId]);
  assert.deepEqual(curriculumPackGate({ declared: undefined, knownPackIds: known, catalogue: null, activation: null }), { gated: false });
  assert.deepEqual(curriculumPackGate({ declared: { packId: "school-own-pack", version: 1 }, knownPackIds: known, catalogue: null, activation: null }), { gated: false });
  const missing = curriculumPackGate({ declared: { packId: row.packId, version: 1 }, knownPackIds: known, catalogue: null, activation: null, now });
  assert.equal(missing.gated && !missing.allowed && missing.code, "CURRICULUM_PACK_NOT_ACTIVE");
  const approvedOnly = curriculumPackGate({ declared: { packId: row.packId, version: 1 }, knownPackIds: known, catalogue: row, activation: evidenced({ status: "APPROVED" }), now });
  assert.equal(approvedOnly.gated && approvedOnly.allowed, false);
  const active = curriculumPackGate({ declared: { packId: row.packId, version: 1 }, knownPackIds: known, catalogue: row, activation: evidenced({ status: "ACTIVE" }), now });
  assert.deepEqual(active, { gated: true, allowed: true, pin: { packId: row.packId, version: 1, contentSha256: row.contentSha256 } });
  const drifted = curriculumPackGate({ declared: { packId: row.packId, version: 1 }, knownPackIds: known, catalogue: row, activation: evidenced({ status: "ACTIVE" }), pin: { packId: row.packId, version: 1, contentSha256: "c".repeat(64) }, now });
  assert.match(JSON.stringify(drifted), /different pack version/);
  const shipped = shippedCurriculumPacks()[0], shippedRow = catalogueRow(shipped);
  const blocked = curriculumPackGate({ declared: { packId: shipped.packId, version: shipped.version }, knownPackIds: new Set([shipped.packId]), catalogue: shippedRow, activation: { ...evidenced({ status: "ACTIVE", contentSha256: shippedRow.contentSha256 }) }, now });
  assert.equal(blocked.gated && !blocked.allowed, true, "an ACTIVE row over an unverified shipped pack is still refused");
});
