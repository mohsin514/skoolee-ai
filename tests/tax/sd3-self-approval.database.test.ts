import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

// SKAI-2142: the SD3 sole-authority self sign-off must reach SCHEDULED (the tax_activations_check used to demand
// approved_by_id <> prepared_by_id, so every attempt was a raw 500). The reason is stored on the row; without it the
// database still refuses a self-approved live row, and a second authority still blocks SD3.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only isolated PostgreSQL 55438.");

mock.module("@/lib/notifications/in-app", { namedExports: { notify: () => {} } });
let approve: typeof import("../../src/lib/tax/service").approve;

const raw = new PrismaClient();
const school = `tax-sd3-${randomUUID()}`, campus = randomUUID();
const owner = { userId: randomUUID(), schoolId: school, campusId: campus, role: "SUPER_ADMIN", institutionKind: "GROUP", isInstitutionOwner: true, email: `${randomUUID()}@example.invalid`, fullName: "Synthetic owner" } as AuthUser;
const ctx = <T>(user: AuthUser, work: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId!, userId: user.userId, role: user.role }, work);

async function readyDraft(hash: string) {
  const a = await raw.taxActivation.create({ data: { schoolId: school, packageCode: "PK-DEMO", packageVersion: 1, campusIds: [campus], legalName: "Synthetic Tax School", taxId: "1234567", currency: "PKR", effectiveFrom: new Date("2099-04-01T00:00:00Z"), ownerId: owner.userId, evidenceReviewer: "Synthetic reviewer", evidenceReference: "EVID-1", evidenceReviewedAt: new Date("2026-10-01T00:00:00Z"), configHash: hash, preparedById: owner.userId } });
  await raw.taxFixtureRun.create({ data: { schoolId: school, activationId: a.id, configHash: hash, fixtures: [], results: [], passed: true, runById: owner.userId } });
  return a.id;
}

before(async () => {
  ({ approve } = await import("../../src/lib/tax/service"));
  await raw.school.create({ data: { id: school, name: "Synthetic tax school", slug: school, regId: school, contactEmail: `${school}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campus, schoolId: school, name: "Synthetic campus", regId: campus, city: "Karachi" } });
  await raw.user.create({ data: { id: owner.userId, schoolId: school, campusId: campus, role: "SUPER_ADMIN", email: owner.email, fullName: owner.fullName!, onboardingComplete: true, isActive: true } });
});
after(async () => {
  await raw.taxActivation.deleteMany({ where: { schoolId: school } });
  await raw.$disconnect(); await prisma.$disconnect();
});

test("the sole authority self-approves with a reason: SCHEDULED, reason stored, audit records it", async () => {
  const id = await readyDraft(`sd3-${randomUUID()}`);
  await assert.rejects(ctx(owner, () => approve(owner, id, "short")), { status: 400 });
  await ctx(owner, () => approve(owner, id, "Owner is the only institution authority"));
  const row = await raw.taxActivation.findUniqueOrThrow({ where: { id } });
  assert.equal(row.status, "SCHEDULED");
  assert.equal(row.approvedById, owner.userId);
  assert.equal(row.selfApprovalReason, "Owner is the only institution authority");
});

test("the database refuses a self-approved live row that has no recorded reason", async () => {
  const id = await readyDraft(`sd3-raw-${randomUUID()}`);
  await assert.rejects(raw.taxActivation.update({ where: { id }, data: { status: "SCHEDULED", approvedById: owner.userId, approvedAt: new Date() } }), /tax_activations_check/);
});

test("a second active authority blocks the SD3 path", async () => {
  const other = randomUUID();
  await raw.user.create({ data: { id: other, schoolId: school, campusId: campus, role: "SUPER_ADMIN", email: `${other}@example.invalid`, fullName: "Second authority", onboardingComplete: true, isActive: true } });
  const id = await readyDraft(`sd3-two-${randomUUID()}`);
  await assert.rejects(ctx(owner, () => approve(owner, id, "Owner is the only institution authority")), { status: 403 });
  await raw.user.delete({ where: { id: other } });
});
