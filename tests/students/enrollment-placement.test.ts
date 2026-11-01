import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertPlacementTarget, assertRollNoFree, canPlaceAcrossCampuses, classSeats } from "../../src/lib/students/enrollment";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";

// SKAI-170: placement rules for a single pupil's enrollment change.
const seatsTx = (occupied: number) => ({ student: { count: async () => occupied } }) as unknown as TxClient;
const admin = { role: "CAMPUS_ADMIN", campusId: "campus-a", schoolId: "s1", userId: "u1" } as unknown as AuthUser;
const superAdmin = { role: "SUPER_ADMIN", campusId: "campus-a", schoolId: "s1", userId: "u2" } as unknown as AuthUser;
const current = { classId: "class-1", campusId: "campus-a" };
const status = async (fn: () => Promise<unknown>) => { try { await fn(); return 200; } catch (e) { return (e as { status?: number }).status; } };

test("SKAI-170: seats report occupancy against an optional capacity", async () => {
  assert.deepEqual(await classSeats(seatsTx(28), { id: "c", capacity: 30 }), { occupied: 28, capacity: 30, free: 2 });
  assert.deepEqual(await classSeats(seatsTx(40), { id: "c", capacity: null }), { occupied: 40, capacity: null, free: null });
});

test("SKAI-170: same class, other campus and a full class are refused; a free seat passes", async () => {
  assert.equal(await status(() => assertPlacementTarget(seatsTx(0), admin, current, { id: "class-1", campusId: "campus-a", capacity: null })), 409);
  assert.equal(await status(() => assertPlacementTarget(seatsTx(0), admin, current, { id: "class-9", campusId: "campus-b", capacity: null })), 403);
  assert.equal(await status(() => assertPlacementTarget(seatsTx(30), admin, current, { id: "class-2", campusId: "campus-a", capacity: 30 })), 409);
  assert.equal(await status(() => assertPlacementTarget(seatsTx(29), admin, current, { id: "class-2", campusId: "campus-a", capacity: 30 })), 200);
  assert.equal(await status(() => assertPlacementTarget(seatsTx(5), admin, current, { id: "class-2", campusId: "campus-a", capacity: null })), 200);
});

test("SKAI-170: only a super admin crosses campuses", async () => {
  assert.equal(canPlaceAcrossCampuses(admin), false);
  assert.equal(canPlaceAcrossCampuses(superAdmin), true);
  assert.equal(await status(() => assertPlacementTarget(seatsTx(0), superAdmin, current, { id: "class-9", campusId: "campus-b", capacity: 10 })), 200);
});

test("SKAI-170: the routes re-check placement, refuse duplicate proposals and bound section transfers by capacity", () => {
  const route = readFileSync("src/app/api/students/enrollments/route.ts", "utf8");
  assert.equal((route.match(/assertPlacementTarget\(/g) ?? []).length, 2);
  assert.match(route, /status: "PROPOSED" \}/);
  assert.match(route, /already has an open enrollment proposal/);
  assert.match(route, /canPlaceAcrossCampuses\(user\) \? \{\} : \{ campusId/);
  assert.match(readFileSync("src/app/api/classes/transfer/route.ts", "utf8"), /preview\.targetOccupancy \+ preview\.ready\.length > preview\.to\.capacity/);
});

// SKAI-203: the section move rechecks seats and target status inside the transaction, not only at preview.
test("section transfer rechecks target capacity under the transaction", () => {
  const source = readFileSync("src/app/api/classes/transfer/route.ts", "utf8");
  const tx = source.slice(source.indexOf("prisma.$transaction(async tx"));
  assert.match(tx, /classSeats\(tx, \{ id: preview\.to\.id, capacity: target\.capacity \}\)/);
  assert.match(tx, /seats\.occupied \+ remaining\.length > seats\.capacity/);
  assert.match(tx, /target\.status !== "ACTIVE"/);
});

// SKAI-172: a transfer's roll number must be free among the target campus's current pupils.
test("transfer roll numbers must be free in the target campus", async () => {
  const pupils = [
    { id: "p1", campusId: "campus-a", rollNo: "12", archivedAt: null },
    { id: "p2", campusId: "campus-a", rollNo: "7", archivedAt: new Date() },
  ];
  const tx = { student: { findFirst: async ({ where }: any) => pupils.find(p => p.id !== where.id.not && p.campusId === where.campusId && p.rollNo === where.rollNo && p.archivedAt === where.archivedAt) ?? null } } as unknown as TxClient;
  await assert.rejects(assertRollNoFree(tx, "mover", "campus-a", " 12 "), { status: 409 });
  await assertRollNoFree(tx, "p1", "campus-a", "12"); // keeping your own roll number
  await assertRollNoFree(tx, "mover", "campus-a", "7"); // archived pupils free their roll number
  await assertRollNoFree(tx, "mover", "campus-b", "12"); // another campus
  assert.match(readFileSync("src/app/api/students/enrollments/route.ts", "utf8"), /assertRollNoFree\(prisma, id, impact\.target\.campusId, rollNo\)/);
});

// SKAI-175: restoring archived pupils (single and bulk) respects the class's seat limit.
test("restore checks class capacity before un-archiving", () => {
  const route = readFileSync("src/app/api/students/route.ts", "utf8");
  assert.match(route, /const seats = await classSeats\(prisma, cls\);\n\s+if \(seats\.capacity != null && seats\.occupied \+ 1 > seats\.capacity\)/);
  assert.match(route, /seats\.occupied \+ want\.count > seats\.capacity/);
  assert.ok(route.indexOf("classSeats(prisma, cls)") < route.indexOf("FOR UPDATE`;\n        const current"));
});
