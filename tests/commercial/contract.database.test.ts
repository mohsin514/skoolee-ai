import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPlanContract } from "@/config/commercial-contract";
import { assertFeatureEnabled, getBillingSnapshot } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";

const databaseUrl = new URL(process.env.DATABASE_URL || "http://invalid");
if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.port !== "55411" || databaseUrl.pathname !== "/sko211") {
  throw new Error("Use only the isolated local sko211 database on 127.0.0.1:55411");
}

const raw = new PrismaClient();
const schoolA = `commercial-a-${randomUUID()}`;
const schoolB = `commercial-b-${randomUUID()}`;
const withSchool = <T>(schoolId: string, role: string, fn: () => Promise<T>) => runWithTenantContext({ schoolId, userId: `${role}-${schoolId}`, role }, fn);

before(async () => {
  await raw.school.create({ data: {
    id: schoolA, name: "Synthetic Pro School", slug: schoolA, regId: schoolA,
    contactEmail: `${schoolA}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "BASIC",
    aiCreditsLimit: 1000, commercialContract: createPlanContract("BASIC"),
  } });
  await raw.school.create({ data: {
    id: schoolB, name: "Synthetic Basic School", slug: schoolB, regId: schoolB,
    contactEmail: `${schoolB}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "FREE",
    aiCreditsLimit: 100, commercialContract: createPlanContract("FREE"),
  } });
  await raw.localePolicy.create({ data: {
    schoolId: schoolA, scopeKey: "school", settings: { country: "SA", currency: "SAR" },
    effectiveAt: new Date("2026-10-01T00:00:00.000Z"), createdBy: `owner-${schoolA}`,
  } });
});

after(async () => {
  await raw.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
  await raw.$disconnect();
  await prisma.$disconnect();
});

test("billing shows the saved contract and the location default without converting price currency", async () => {
  const snapshot = await withSchool(schoolA, "SUPER_ADMIN", () => getBillingSnapshot(schoolA, prisma));
  assert.equal(snapshot.limits.maxStudents, 500);
  assert.equal(snapshot.limits.aiCredits, 1000);
  assert.equal(snapshot.regionalCurrency, "SAR");
  assert.equal(snapshot.priceCurrency, "PKR");
  assert.equal(snapshot.commercialContractVersion, "2026-10-08.1");
});

test("enforced feature access reads each tenant's saved plan terms", async () => {
  await withSchool(schoolA, "TEACHER", () => assertFeatureEnabled(schoolA, "whatsappEnabled", prisma));
  await assert.rejects(
    () => withSchool(schoolB, "SUPER_ADMIN", () => assertFeatureEnabled(schoolB, "whatsappEnabled", prisma)),
    /does not include this feature/
  );
});

test("tenant guard hides another school's currency policy", async () => {
  await assert.rejects(
    () => withSchool(schoolA, "SUPER_ADMIN", () => prisma.localePolicy.findFirst({ where: { schoolId: schoolB } })),
    /cannot access that record/
  );
});
