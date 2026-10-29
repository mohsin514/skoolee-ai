import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SUBJECT_PACKS, assertSubjectCodeFree, normalizeSubjectCode } from "../../src/lib/academic/subject-catalogue";
import type { TxClient } from "../../src/lib/db/prisma";

// SKAI-149: subject codes, core vs elective, archive-not-delete and pack bulk add.
test("subject codes are trimmed, upper-cased and validated", () => {
  assert.equal(normalizeSubjectCode(" math "), "MATH");
  assert.equal(normalizeSubjectCode(""), null);
  assert.equal(normalizeSubjectCode(undefined), null);
  assert.throws(() => normalizeSubjectCode("MATH 101"), { status: 400 });
  assert.throws(() => normalizeSubjectCode("A".repeat(13)), { status: 400 });
});

function fakeTx(rows: { schoolId: string; code: string; name: string; id: string }[]) {
  const seen: unknown[] = [];
  const tx = { subject: { findMany: async ({ where }: any) => { seen.push(where); return rows.filter(row => row.schoolId === where.schoolId && row.code === where.code.equals && row.id !== where.id?.not); } } };
  return { tx: tx as unknown as TxClient, seen };
}

test("a code keeps one meaning per school but may repeat across classes", async () => {
  const { tx, seen } = fakeTx([{ schoolId: "a", code: "MATH", name: "Mathematics", id: "s1" }]);
  await assertSubjectCodeFree(tx, "a", "MATH", " mathematics ");
  await assert.rejects(() => assertSubjectCodeFree(tx, "a", "MATH", "Music"), { status: 409 });
  await assertSubjectCodeFree(tx, "a", "MATH", "Music", "s1");
  // Another school's MATH never blocks or leaks: the lookup is always school-scoped.
  await assertSubjectCodeFree(tx, "b", "MATH", "Music");
  assert.ok(seen.every((where: any) => typeof where.schoolId === "string"));
});

test("curriculum packs carry unique, valid codes and mark electives", () => {
  for (const pack of Object.values(SUBJECT_PACKS)) {
    const codes = pack.subjects.map(item => normalizeSubjectCode(item.code));
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(pack.subjects.some(item => item.isElective) && pack.subjects.some(item => !item.isElective));
  }
});

test("in-use subjects are archived, archived subjects leave pickers, and writes stay permission-gated", () => {
  const route = readFileSync("src/app/api/subjects/route.ts", "utf8"), assign = readFileSync("src/lib/api/teacher-assignments.ts", "utf8"), admin = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(route, /includeArchived \? \{\} : \{ archivedAt: null \}/);
  assert.equal(route.match(/if \(!canManageOperations\(user\)\) throw new ApiError\("Insufficient permissions", 403\)/g)?.length, 3);
  assert.match(assign, /Restore this subject before editing it/);
  assert.match(admin, /blocked \? ui\("Archive subject"\)/);
});
