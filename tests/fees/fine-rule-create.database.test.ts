import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { runAsUser } from "../../src/lib/db/tenant-context";
import { ApiError } from "../../src/lib/api/scope";
import { createFineRule } from "../../src/lib/fees/fine-rule-command";

// SKAI-1621 on an isolated local database: concurrent same-name fine-rule creates either replay the
// committed rule (identical payload) or return a controlled 409 (differing payload). Never a raw P2002.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1") throw Error("Only an isolated loopback database may be used for this test");

const db = new PrismaClient();
const tag = randomUUID().slice(0, 8);
const schoolA = `ffr-a-${tag}`, schoolB = `ffr-b-${tag}`;
const campuses = { a1: randomUUID(), a2: randomUUID(), a3: randomUUID(), a4: randomUUID(), a5: randomUUID(), b1: randomUUID() };
const NAME = "Late 5%";
const body = (overrides: Record<string, unknown> = {}) => ({ name: `  ${NAME}  `, type: "PERCENT", value: 5, graceDays: 3, isActive: true, ...overrides });

function accountant(schoolId: string, campusId: string): AuthUser {
  return { userId: randomUUID(), email: `${randomUUID()}@example.invalid`, fullName: "Synthetic accountant", role: "ACCOUNTANT", schoolId, campusId, onboardingComplete: true, mfaVerified: true };
}

const create = (user: AuthUser, input: Record<string, unknown>) => runAsUser(user, () => createFineRule(user, input));

async function settle<T>(promises: Promise<T>[]) {
  return Promise.allSettled(promises);
}

async function rulesFor(campusId: string) {
  return db.feeFineRule.findMany({ where: { campusId, name: NAME } });
}

// The tenant audit extension also writes an automatic row per create; the command's own row is the one
// that carries action CREATE, so counting those proves exactly one committed audit event.
async function auditFor(recordIds: string[]) {
  return db.auditLog.findMany({ where: { tableName: "fee_fine_rules", recordId: { in: recordIds }, newValue: { path: ["action"], equals: "CREATE" } } });
}

before(async () => {
  for (const [schoolId, label] of [[schoolA, "A"], [schoolB, "B"]] as const) {
    await db.school.create({ data: { id: schoolId, name: `Synthetic fine school ${label}`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  }
  const campusRows: [string, string, string][] = [
    [campuses.a1, schoolA, "A1"], [campuses.a2, schoolA, "A2"], [campuses.a3, schoolA, "A3"], [campuses.a4, schoolA, "A4"], [campuses.a5, schoolA, "A5"], [campuses.b1, schoolB, "B1"],
  ];
  for (const [id, schoolId, label] of campusRows) {
    await db.campus.create({ data: { id, schoolId, name: `Synthetic campus ${label}`, city: "Synthetic", regId: id } });
  }
});

after(async () => {
  await db.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } }).catch(() => undefined);
  await db.$disconnect();
});

test("identical concurrent creates commit one rule, one audit row, and both callers get the committed rule", async () => {
  const user = accountant(schoolA, campuses.a1);
  const results = await settle([create(user, body()), create(user, body())]);

  for (const result of results) assert.equal(result.status, "fulfilled", result.status === "rejected" ? String(result.reason) : "");
  const ids = results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id);
  assert.equal(ids[0], ids[1], "both callers must receive the same committed rule");

  const rows = await rulesFor(campuses.a1);
  assert.equal(rows.length, 1);
  assert.equal((await auditFor([ids[0]])).length, 1, "exactly one audit event for the committed rule");
});

test("concurrent creates with differing payloads commit one rule and return a controlled 409 to the other", async () => {
  const user = accountant(schoolA, campuses.a2);
  const results = await settle([create(user, body({ value: 5 })), create(user, body({ value: 6 }))]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof ApiError, `expected ApiError, got ${String(rejected[0].reason)}`);
  assert.equal((rejected[0].reason as ApiError).status, 409);
  assert.doesNotMatch(String((rejected[0].reason as Error).message), /P2002|Unique|prisma/i);

  const rows = await rulesFor(campuses.a2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, (fulfilled[0] as PromiseFulfilledResult<{ value: number }>).value.value);
  assert.equal((await auditFor([rows[0].id])).length, 1);
});

test("after commit a sequential identical request replays and a differing one is a 409", async () => {
  const user = accountant(schoolA, campuses.a4);
  const first = await create(user, body({ graceDays: 7 }));
  const replay = await create(user, body({ graceDays: 7 }));
  assert.equal(replay.id, first.id);
  assert.equal((await auditFor([first.id])).length, 1, "a replay writes no second audit row");

  await assert.rejects(create(user, body({ graceDays: 8 })), (error: unknown) => error instanceof ApiError && error.status === 409);
  await assert.rejects(create(user, body({ isActive: false, graceDays: 7 })), (error: unknown) => error instanceof ApiError && error.status === 409);
  assert.equal((await rulesFor(campuses.a4)).length, 1);
});

test("campus isolation: the same name on two campuses of one school is independent", async () => {
  const onA3 = accountant(schoolA, campuses.a3);
  const onA5 = accountant(schoolA, campuses.a5);
  const results = await settle([create(onA3, body()), create(onA5, body({ value: 9 }))]);
  for (const result of results) assert.equal(result.status, "fulfilled");
  assert.equal((await rulesFor(campuses.a3)).length, 1);
  assert.equal((await rulesFor(campuses.a5)).length, 1);
});

test("school isolation: the same name in another school is independent and cannot replay across schools", async () => {
  const userA = accountant(schoolA, campuses.a1);
  const userB = accountant(schoolB, campuses.b1);
  const results = await settle([create(userA, body({ value: 5 })), create(userB, body({ value: 6 }))]);
  for (const result of results) assert.equal(result.status, "fulfilled");
  assert.equal((await rulesFor(campuses.b1)).length, 1);
  assert.equal((await rulesFor(campuses.a1)).length, 1);
});
