import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertCapacityFitsEnrolled, parseClassCapacity } from "../../src/lib/academic/class-setup";

// SKAI-1448: rollover capacity edits follow the class-setup floor and cannot race an enrollment.
const lib = readFileSync("src/lib/academic/rollover.ts", "utf8");
const route = readFileSync("src/app/api/academic/rollover/route.ts", "utf8");
const fn = lib.slice(lib.indexOf("export async function setClassCapacity"), lib.indexOf("type Row ="));

const save = (raw: unknown, enrolled: number) => { const c = parseClassCapacity(raw); assertCapacityFitsEnrolled(c, enrolled); return c; };
const status = (f: () => unknown) => { try { f(); return 200; } catch (e) { return (e as { status?: number }).status; } };

test("equal to occupancy is allowed and a repeated submit stays allowed", () => {
  assert.equal(save(10, 10), 10);
  assert.equal(save(10, 10), 10);
  assert.equal(save(null, 10), null);
});

test("below occupancy is rejected with 409 and bad input with 400", () => {
  assert.equal(status(() => save(5, 10)), 409);
  assert.equal(status(() => save(0, 0)), 400);
  assert.equal(status(() => save(9999, 0)), 400);
  assert.equal(status(() => save("abc", 0)), 400);
});

test("the service counts only active, non-archived learners in the school's class", () => {
  assert.match(fn, /parseClassCapacity\(rawCapacity\)/);
  assert.match(fn, /assertRegistrar\(user\)/);
  assert.match(fn, /tx\.student\.count\(\{ where: \{ schoolId: user\.schoolId, classId, archivedAt: null, status: "active" \} \}\)/);
});

test("School B / Campus B cannot reach School A's class", () => {
  assert.match(fn, /tx\.class\.findFirst\(\{ where: \{ id: classId, campusId, schoolId: user\.schoolId \} \}\)/);
  assert.match(fn, /throw new ApiError\("Class not found", 404\)/);
});

test("the count and update run under a class row lock and serializable isolation", () => {
  const lock = fn.indexOf("FOR UPDATE"), count = fn.indexOf("tx.student.count"), update = fn.indexOf("tx.class.update");
  assert.ok(lock > 0 && lock < count && count < update, "lock precedes count precedes update");
  assert.match(fn, /SELECT id FROM classes WHERE id = \$\{classId\} AND school_id = \$\{user\.schoolId\} FOR UPDATE/);
  assert.match(fn, /isolationLevel: "Serializable"/);
  assert.match(fn, /code === "P2034"\) throw new ApiError\([^)]*, 409\)/);
});

test("the route dispatches the capacity action to the shared service", () => {
  assert.match(route, /setClassCapacity/);
});
