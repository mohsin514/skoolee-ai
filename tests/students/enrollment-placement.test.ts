import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertPlacementTarget, canPlaceAcrossCampuses, classSeats } from "../../src/lib/students/enrollment";
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
