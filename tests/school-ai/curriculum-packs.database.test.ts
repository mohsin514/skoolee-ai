// SKAI-1008..1012 DB integration: catalogue seed, per-campus activation lifecycle, append-only audit,
// permissions across roles and two schools, and the generation gate. Disposable loopback database only.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { catalogueRow, shippedCurriculumPacks } from "../../src/lib/school-ai/curriculum-pack-registry";
import { curriculumPackGateFor, recordPackEvidence, requestCurriculumPack, schoolCurriculumPacks, transitionCurriculumPack } from "../../src/lib/school-ai/curriculum-pack-service";
import type { CurriculumContract } from "../../src/lib/school-ai/curriculum-contract";

const url = process.env.DATABASE_URL ?? "";
if (!url || url !== process.env.DIRECT_URL || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Use a disposable loopback PostgreSQL database (DATABASE_URL = DIRECT_URL).");
const db = new PrismaClient();
after(async () => { await db.$disconnect(); await prisma.$disconnect(); });

const as = <T>(user: AuthUser, run: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, userId: user.userId, campusId: user.campusId, role: user.role, unscoped: false }, run);

// Synthetic contract: test fixture values, not curriculum facts.
const synthetic = (packId: string): CurriculumContract => ({
  packId, version: 1, status: "DRAFT", board: "BISE_LAHORE", qualification: "Synthetic SSC", examSession: "First Annual",
  examYear: "2027", teachingYear: "2026-27", gradeMapping: { boardLevel: "SSC-I", schoolGrade: "9" }, term: "Annual", subject: "Mathematics", tier: "Core", language: "en",
  outcomes: [{ code: "SYN-1", statement: "Synthetic outcome", assessed: true }],
  paper: { totalMarks: 60, durationMinutes: 120, sections: [{ id: "A", format: "MCQ", marks: 20, questionCount: 20, attempt: 20 }, { id: "B", format: "LONG", marks: 40, questionCount: 6, attempt: 4 }], calculator: "NOT_ALLOWED", rules: ["Synthetic rule"] },
  sources: [{ id: "s1", kind: "SYLLABUS", authority: "Synthetic Board", reference: "SYN/1", edition: "2027", url: "https://example.test/syllabus.pdf", retrievedOn: "2026-10-29", checksumSha256: "a".repeat(64), applicability: "QA schools" }],
  register: { reviewTrigger: "New board notice" }, unverified: [],
});

async function catalogue(contract: CurriculumContract) {
  const row = catalogueRow(contract);
  return db.curriculumPackVersion.upsert({ where: { packId_version: { packId: row.packId, version: row.version } }, update: {}, create: { packId: row.packId, version: row.version, board: row.board, subject: row.subject, schoolGrade: row.schoolGrade, examYear: row.examYear, language: row.language, status: row.status, content: row.content as unknown as Prisma.InputJsonValue, contentSha256: row.contentSha256, unverified: [] } });
}

async function school(label: string) {
  const schoolId = `packs-${label}-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label}`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Test", status: "ACTIVE" } });
  await db.campus.createMany({ data: [{ id: campusA, schoolId, name: "Campus A", regId: campusA, city: "Test" }, { id: campusB, schoolId, name: "Campus B", regId: campusB, city: "Test" }] });
  const user = async (role: "SUPER_ADMIN" | "CAMPUS_ADMIN" | "PRINCIPAL" | "TEACHER", campusId: string | null): Promise<AuthUser> => {
    const id = randomUUID();
    await db.user.create({ data: { id, schoolId, campusId, fullName: `${role} ${label}`, email: `${id}@example.invalid`, role } });
    return { userId: id, schoolId, campusId, role, email: `${id}@example.invalid`, fullName: `${role} ${label}` };
  };
  return { schoolId, campusA, campusB, owner: await user("SUPER_ADMIN", null), adminA: await user("CAMPUS_ADMIN", campusA), principalA: await user("PRINCIPAL", campusA), principalB: await user("PRINCIPAL", campusB), teacherA: await user("TEACHER", campusA) };
}

test("shipped packs seed idempotently and stay blocked; a synthetic pack runs the full lifecycle with an append-only audit", async () => {
  for (const pack of shippedCurriculumPacks()) await catalogue(pack);
  const shipped = await db.curriculumPackVersion.count({ where: { packId: { in: shippedCurriculumPacks().map(pack => pack.packId) } } });
  for (const pack of shippedCurriculumPacks()) await catalogue(pack);
  assert.equal(await db.curriculumPackVersion.count({ where: { packId: { in: shippedCurriculumPacks().map(pack => pack.packId) } } }), shipped, "re-seeding adds nothing");

  const version = await catalogue(synthetic(`synthetic-${randomUUID().slice(0, 8)}`));
  const a = await school("a"), b = await school("b");
  try {
    // Denied requesters.
    for (const user of [a.teacherA, a.principalA]) await assert.rejects(as(user, () => requestCurriculumPack(user, { packVersionId: version.id, campusId: a.campusA, geography: "PAKISTAN_LAHORE", schoolGrade: "9" })), /group owner|campus administrator|managed by/);
    await assert.rejects(as(a.adminA, () => requestCurriculumPack(a.adminA, { packVersionId: version.id, campusId: a.campusB, geography: "PAKISTAN_LAHORE", schoolGrade: "9" })), /own campus/);
    await assert.rejects(as(b.owner, () => requestCurriculumPack(b.owner, { packVersionId: version.id, campusId: a.campusA, geography: "PAKISTAN_LAHORE", schoolGrade: "9" })), /unavailable/, "school B cannot target school A's campus");

    const { id } = await as(a.adminA, () => requestCurriculumPack(a.adminA, { packVersionId: version.id, campusId: a.campusA, geography: "PAKISTAN_LAHORE", schoolGrade: "9" }));
    await assert.rejects(as(a.adminA, () => requestCurriculumPack(a.adminA, { packVersionId: version.id, campusId: a.campusA, geography: "PAKISTAN_LAHORE", schoolGrade: "9" })), /open request/);
    const view = await as(a.adminA, () => schoolCurriculumPacks(a.adminA));
    const mine = view.activations.find(row => row.id === id)!;
    assert.match(mine.blockers.join(" "), /rights scope/, "the screen shows why it is blocked");
    assert.equal((await as(b.owner, () => schoolCurriculumPacks(b.owner))).activations.some(row => row.id === id), false, "school B never sees school A's request");

    await assert.rejects(as(b.owner, () => recordPackEvidence(b.owner, id, { sourceId: "s1", rightsScope: "x", permissionEvidence: "y" })), /not found/);
    await as(a.adminA, () => recordPackEvidence(a.adminA, id, { sourceId: "s1", rightsScope: "Reference only", permissionEvidence: "Board letter SYN-12" }));

    const dates = { approvedOn: "2026-10-28", reviewDueOn: "2099-10-28" };
    await assert.rejects(as(a.adminA, () => transitionCurriculumPack(a.adminA, id, { to: "APPROVED", ...dates })), /educator approver/);
    await assert.rejects(as(a.principalB, () => transitionCurriculumPack(a.principalB, id, { to: "APPROVED", ...dates })), /educator approver|not found/, "another campus's principal");
    await assert.rejects(as(b.principalA, () => transitionCurriculumPack(b.principalA, id, { to: "APPROVED", ...dates })), /not found/, "another school's principal");
    await as(a.principalA, () => transitionCurriculumPack(a.principalA, id, { to: "APPROVED", ...dates }));
    await assert.rejects(as(a.adminA, () => recordPackEvidence(a.adminA, id, { sourceId: "s1", rightsScope: "x", permissionEvidence: "y" })), /draft/, "evidence is frozen once approved");

    const before = await db.curriculumPackActivation.findUniqueOrThrow({ where: { id } });
    const gateBefore = await as(a.adminA, () => curriculumPackGateFor(prisma, a.schoolId, a.campusA, { packId: version.packId, version: 1 }));
    assert.equal(gateBefore.gated && !gateBefore.allowed, true, "APPROVED is not yet ACTIVE");
    await as(a.adminA, () => transitionCurriculumPack(a.adminA, id, { to: "ACTIVE" }));
    const gate = await as(a.adminA, () => curriculumPackGateFor(prisma, a.schoolId, a.campusA, { packId: version.packId, version: 1 }));
    assert.deepEqual(gate, { gated: true, allowed: true, pin: { packId: version.packId, version: 1, contentSha256: before.contentSha256 } });
    const otherCampus = await as(a.owner, () => curriculumPackGateFor(prisma, a.schoolId, a.campusB, { packId: version.packId, version: 1 }));
    assert.equal(otherCampus.gated && !otherCampus.allowed, true, "activation is per campus");
    const otherSchool = await as(b.owner, () => curriculumPackGateFor(prisma, b.schoolId, b.campusA, { packId: version.packId, version: 1 }));
    assert.equal(otherSchool.gated && !otherSchool.allowed, true, "activation is per school");

    await assert.rejects(as(a.teacherA, () => transitionCurriculumPack(a.teacherA, id, { to: "REVOKED", reason: "x" })), /managed by/);
    await as(a.principalA, () => transitionCurriculumPack(a.principalA, id, { to: "REVOKED", reason: "Board notice superseded" }));
    await assert.rejects(as(a.adminA, () => transitionCurriculumPack(a.adminA, id, { to: "ACTIVE" })), /revoked/i, "revoke is terminal");
    const revokedGate = await as(a.adminA, () => curriculumPackGateFor(prisma, a.schoolId, a.campusA, { packId: version.packId, version: 1 }));
    assert.equal(revokedGate.gated && !revokedGate.allowed, true);

    const events = await db.curriculumPackActivationEvent.findMany({ where: { activationId: id }, orderBy: { at: "asc" } });
    assert.deepEqual(events.map(event => [event.fromStatus, event.toStatus]), [[null, "DRAFT"], ["DRAFT", "APPROVED"], ["APPROVED", "ACTIVE"], ["ACTIVE", "REVOKED"]]);
    await assert.rejects(db.curriculumPackActivationEvent.update({ where: { id: events[0].id }, data: { reason: "rewrite" } }), /append-only/);
    await assert.rejects(db.curriculumPackVersion.update({ where: { id: version.id }, data: { contentSha256: "f".repeat(64) } }), /immutable/);

    // The shipped FBISE pack: even a fully evidenced, approved request cannot be activated.
    const fbise = await db.curriculumPackVersion.findFirstOrThrow({ where: { packId: shippedCurriculumPacks()[0].packId } });
    const shippedRequest = await as(a.adminA, () => requestCurriculumPack(a.adminA, { packVersionId: fbise.id, campusId: a.campusA, geography: "PAKISTAN_ISLAMABAD_RAWALPINDI", schoolGrade: "9" }));
    for (const source of shippedCurriculumPacks()[0].sources) await as(a.adminA, () => recordPackEvidence(a.adminA, shippedRequest.id, { sourceId: source.id, rightsScope: "Synthetic", permissionEvidence: "Synthetic" }));
    await as(a.principalA, () => transitionCurriculumPack(a.principalA, shippedRequest.id, { to: "APPROVED", ...dates }));
    await assert.rejects(as(a.adminA, () => transitionCurriculumPack(a.adminA, shippedRequest.id, { to: "ACTIVE" })), /Unverified/);
  } finally {
    await db.school.delete({ where: { id: a.schoolId } });
    await db.school.delete({ where: { id: b.schoolId } });
  }
});
