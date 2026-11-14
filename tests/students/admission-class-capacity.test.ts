import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertAdmissionSeats } from "../../src/lib/students/enrollment";
import type { TxClient } from "../../src/lib/db/prisma";

// SKAI-1927: Add student must respect class capacity, as restore and transfer already do.
type Cls = { id: string; schoolId: string; name: string; section: string | null; capacity: number | null };
const CLASSES: Cls[] = [
  { id: "g7", schoolId: "s1", name: "Grade 7", section: null, capacity: 40 },
  { id: "g8", schoolId: "s1", name: "Grade 8", section: "B", capacity: 30 },
  { id: "open", schoolId: "s1", name: "Grade 9", section: null, capacity: null },
  { id: "other", schoolId: "s2", name: "Grade 7", section: null, capacity: 1 },
];
function fakeTx(active: Record<string, number>) {
  const classWheres: unknown[] = [];
  const seatReads: { schoolId: string; classId: { in: string[] } }[] = [];
  const tx = {
    class: {
      findMany: async ({ where }: { where: { id: { in: string[] }; schoolId: string } }) => {
        classWheres.push(where);
        return CLASSES.filter((c) => where.id.in.includes(c.id) && c.schoolId === where.schoolId);
      },
    },
    // SKAI-1970: one grouped count for all capped classes, scoped to the school.
    student: { groupBy: async ({ by, where }: { by: string[]; where: { schoolId: string; classId: { in: string[] }; archivedAt: null; status: string } }) => {
      seatReads.push(where);
      assert.deepEqual(by, ["classId"]);
      assert.equal(where.archivedAt, null);
      assert.equal(where.status, "active");
      return where.classId.in.filter((id) => active[id]).map((classId) => ({ classId, _count: { _all: active[classId] } }));
    } },
  } as unknown as TxClient;
  return { tx, classWheres, seatReads };
}
const outcome = async (fn: () => Promise<unknown>) => {
  try { await fn(); return { status: 200, message: "" }; } catch (e) { return { status: (e as { status?: number }).status, message: (e as Error).message }; }
};

test("SKAI-1927: admitting into a full class is refused with 409 and the seat count", async () => {
  const { tx } = fakeTx({ g7: 40 });
  const result = await outcome(() => assertAdmissionSeats(tx, "s1", ["g7"]));
  assert.equal(result.status, 409);
  assert.match(result.message, /Grade 7 is full \(40 of 40 seats\)/);
});

test("SKAI-1927: an over-capacity class (41 of 40) still refuses another admission", async () => {
  const { tx } = fakeTx({ g7: 41 });
  assert.equal((await outcome(() => assertAdmissionSeats(tx, "s1", ["g7"]))).status, 409);
});

test("SKAI-1927: the last free seat is admitted; a class with no capacity set is unlimited", async () => {
  const { tx } = fakeTx({ g7: 39, open: 500 });
  assert.equal((await outcome(() => assertAdmissionSeats(tx, "s1", ["g7"]))).status, 200);
  assert.equal((await outcome(() => assertAdmissionSeats(tx, "s1", ["open", "open"]))).status, 200);
});

test("SKAI-1927: a bulk request counts every pupil it adds to the same class", async () => {
  const { tx } = fakeTx({ g8: 28 });
  assert.equal((await outcome(() => assertAdmissionSeats(tx, "s1", ["g8", "g8"]))).status, 200);
  const over = await outcome(() => assertAdmissionSeats(tx, "s1", ["g8", "g8", "g8"]));
  assert.equal(over.status, 409);
  assert.match(over.message, /Grade 8 B is full \(28 of 30 seats, 3 pupils to add\)/);
});

test("SKAI-1970: a bulk import across several capped classes counts seats in one school-scoped query", async () => {
  const { tx, seatReads } = fakeTx({ g7: 10, g8: 29 });
  const over = await outcome(() => assertAdmissionSeats(tx, "s1", ["g7", "g8", "g8", "open"]));
  assert.equal(over.status, 409);
  assert.match(over.message, /Grade 8 B is full \(29 of 30 seats, 2 pupils to add\)/);
  assert.deepEqual(seatReads, [{ schoolId: "s1", classId: { in: ["g7", "g8"] }, archivedAt: null, status: "active" }], "uncapped classes are not counted");
  const { tx: openOnly, seatReads: none } = fakeTx({ open: 900 });
  assert.equal((await outcome(() => assertAdmissionSeats(openOnly, "s1", ["open"]))).status, 200);
  assert.equal(none.length, 0, "no seat read when no destination class has a capacity");
});

test("SKAI-1927: capacity is read only inside the caller's school", async () => {
  const { tx, classWheres } = fakeTx({ other: 5 });
  // Another school's class is never read, so its capacity cannot block or leak into this school's admission.
  assert.equal((await outcome(() => assertAdmissionSeats(tx, "s1", ["other"]))).status, 200);
  assert.deepEqual(classWheres[0], { id: { in: ["other"] }, schoolId: "s1" });
});

test("SKAI-1927: createStudentRecords checks seats inside the locked admission transaction", () => {
  const create = readFileSync("src/lib/students/create.ts", "utf8");
  assert.match(create, /\$transaction[\s\S]*FOR UPDATE[\s\S]*assertAdmissionSeats\(tx as TxClient, user\.schoolId, students\.map\(\(student\) => student\.classId\)\)[\s\S]*tx\.student\.create/);
});
