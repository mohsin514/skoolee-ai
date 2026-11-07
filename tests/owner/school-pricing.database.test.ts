import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { saveSchoolPlanPrices } from "../../src/lib/owner/school-pricing-service";

// SKAI-1795: saving one plan's override keeps the others. SKAI-1794: a save carries the overrides it loaded; a stale or
// concurrent save gets 409 and writes nothing. Only the platform owner may save.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== (process.env.QA_DB_PORT || "55438") || database.pathname !== "/postgres") throw new Error("Use only an isolated local PostgreSQL.");
const raw = new PrismaClient();
const platform = `price-p-${randomUUID()}`, schoolA = `price-a-${randomUUID()}`, schoolB = `price-b-${randomUUID()}`;
let owner: AuthUser, schoolOwner: AuthUser;
const pricing = async (id: string) => (await raw.school.findUniqueOrThrow({ where: { id } })).planPricing;
const status = (e: unknown) => (e as { status?: number }).status;

before(async () => {
  for (const id of [platform, schoolA, schoolB]) await raw.school.create({ data: { id, name: `Synthetic ${id.slice(0, 7)}`, slug: id, regId: id, contactEmail: `${id}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  const ownerId = randomUUID(), adminId = randomUUID();
  await raw.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid`, password: "x", fullName: "Synthetic Platform Owner", role: "APP_OWNER" as never, schoolId: platform, isActive: true } });
  await raw.user.create({ data: { id: adminId, email: `${adminId}@example.invalid`, password: "x", fullName: "Synthetic School Owner", role: "SUPER_ADMIN" as never, schoolId: schoolA, isActive: true } });
  owner = { userId: ownerId, schoolId: platform, role: "APP_OWNER", email: "o@example.invalid" } as AuthUser;
  schoolOwner = { userId: adminId, schoolId: schoolA, role: "SUPER_ADMIN", email: "s@example.invalid" } as AuthUser;
});

after(async () => {
  await raw.superAdminAuditLog.deleteMany({ where: { targetId: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await raw.user.deleteMany({ where: { schoolId: { in: [platform, schoolA, schoolB] } } }).catch(() => undefined);
  for (const id of [platform, schoolA, schoolB]) await raw.school.delete({ where: { id } }).catch(() => undefined);
  await raw.$disconnect(); await prisma.$disconnect();
});

test("saving only PRO keeps an existing BASIC override; a plan sent without a price clears only that plan", async () => {
  await saveSchoolPlanPrices(owner, schoolA, { BASIC: { price: 3900 } }, { expected: null });
  await saveSchoolPlanPrices(owner, schoolA, { PRO: { price: 6500 } }, { expected: { BASIC: { price: 3900 } } });
  assert.deepEqual(await pricing(schoolA), { BASIC: { price: 3900 }, PRO: { price: 6500 } });
  await saveSchoolPlanPrices(owner, schoolA, { BASIC: {} }, { expected: { BASIC: { price: 3900 }, PRO: { price: 6500 } } });
  assert.deepEqual(await pricing(schoolA), { PRO: { price: 6500 } });
  assert.equal(await pricing(schoolB), null, "the other school is untouched");
});

test("two concurrent saves from the same loaded prices: one wins, the other gets 409 and writes nothing", async () => {
  const loaded = await pricing(schoolA);
  const results = await Promise.allSettled([
    saveSchoolPlanPrices(owner, schoolA, { PRO: { price: 7100 } }, { expected: loaded }),
    saveSchoolPlanPrices(owner, schoolA, { PRO: { price: 7200 } }, { expected: loaded }),
  ]);
  const won = results.filter(r => r.status === "fulfilled") as PromiseFulfilledResult<Record<string, { price?: number }>>[];
  const lost = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(won.length, 1); assert.equal(lost.length, 1);
  assert.equal(status(lost[0].reason), 409);
  assert.deepEqual(await pricing(schoolA), won[0].value, "the stored value is the winner's");
  await assert.rejects(saveSchoolPlanPrices(owner, schoolA, { BASIC: { price: 1 } }, { expected: loaded }), e => status(e) === 409, "a stale save is refused");
  assert.deepEqual(await pricing(schoolA), won[0].value, "the stale save wrote nothing");
});

test("only the platform owner saves; bad input and unknown schools are refused", async () => {
  await assert.rejects(saveSchoolPlanPrices(schoolOwner, schoolA, { PRO: { price: 1 } }), e => status(e) === 403);
  await assert.rejects(saveSchoolPlanPrices(owner, schoolA, { PRO: { price: -1 } }), e => status(e) === 400);
  await assert.rejects(saveSchoolPlanPrices(owner, randomUUID(), { PRO: { price: 1 } }), e => status(e) === 404);
});
