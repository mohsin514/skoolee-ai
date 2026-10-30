import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertCapacityFitsEnrolled, gradeRangeNames, parseClassCapacity, parseGradeRange } from "../../src/lib/academic/class-setup";
import { findDuplicateClass } from "../../src/lib/academic/structure";
import { classSetupUiEntries } from "../../src/lib/locale/class-setup-ui-messages";
import { reviewedTranslation } from "../../src/lib/locale/ui-messages";
import type { TxClient } from "../../src/lib/db/prisma";

// SKAI-148: class setup — capacity, grade-range bulk create, unique names per campus, archive-not-delete.
test("capacity is optional, whole and bounded", () => {
  assert.equal(parseClassCapacity(undefined), null);
  assert.equal(parseClassCapacity(""), null);
  assert.equal(parseClassCapacity(null), null);
  assert.equal(parseClassCapacity("35"), 35);
  assert.equal(parseClassCapacity(200), 200);
  for (const bad of [0, -1, 201, 2.5, "abc"]) assert.throws(() => parseClassCapacity(bad), { status: 400 });
});

test("capacity never drops below the enrolled count", () => {
  assertCapacityFitsEnrolled(null, 40);
  assertCapacityFitsEnrolled(30, 30);
  assert.throws(() => assertCapacityFitsEnrolled(29, 30), { status: 409 });
});

test("a grade range names one class per grade and is bounded", () => {
  assert.equal(parseGradeRange(undefined), null);
  const range = parseGradeRange({ prefix: " Grade ", from: 1, to: 5 });
  assert.deepEqual(range, { prefix: "Grade", from: 1, to: 5 });
  assert.deepEqual(gradeRangeNames(range!), ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]);
  assert.deepEqual(gradeRangeNames({ prefix: "KG", from: 0, to: 0 }), ["KG 0"]);
  assert.throws(() => parseGradeRange({ prefix: "", from: 1, to: 2 }), { status: 400 });
  assert.throws(() => parseGradeRange({ prefix: "Grade", from: 5, to: 1 }), { status: 400 });
  assert.throws(() => parseGradeRange({ prefix: "Grade", from: 1, to: 16 }), { status: 400 });
  assert.throws(() => parseGradeRange("Grade 1-5"), { status: 400 });
});

function fakeTx(rows: { id: string; schoolId: string; campusId: string; name: string; section: string | null; academicYear: number }[]) {
  const seen: any[] = [];
  const tx = { class: { findMany: async ({ where }: any) => { seen.push(where); return rows.filter(row => row.schoolId === where.schoolId && row.campusId === where.campusId && row.academicYear === where.academicYear && row.id !== where.id?.not); } } };
  return { tx: tx as unknown as TxClient, seen };
}

test("class names are unique per campus and year, case and space insensitive, never across tenants", async () => {
  const { tx, seen } = fakeTx([{ id: "c1", schoolId: "a", campusId: "a1", name: "Grade 1", section: "A", academicYear: 2026 }]);
  assert.equal((await findDuplicateClass(tx, { schoolId: "a", campusId: "a1" }, { name: " grade 1 ", section: "a", academicYear: 2026 }))?.id, "c1");
  // Another campus, another school, another year or the same record are all free.
  assert.equal(await findDuplicateClass(tx, { schoolId: "a", campusId: "a2" }, { name: "Grade 1", section: "A", academicYear: 2026 }), null);
  assert.equal(await findDuplicateClass(tx, { schoolId: "b", campusId: "a1" }, { name: "Grade 1", section: "A", academicYear: 2026 }), null);
  assert.equal(await findDuplicateClass(tx, { schoolId: "a", campusId: "a1" }, { name: "Grade 1", section: "A", academicYear: 2027 }), null);
  assert.equal(await findDuplicateClass(tx, { schoolId: "a", campusId: "a1" }, { name: "Grade 1", section: "A", academicYear: 2026 }, "c1"), null);
  assert.ok(seen.every(where => typeof where.schoolId === "string" && where.archivedAt === null));
});

test("the class route keeps role gates, archive-not-delete and tenant-scoped audits", () => {
  const route = readFileSync("src/app/api/classes/route.ts", "utf8");
  assert.match(route, /if \(!canManageCampusOps\(user\)\) throw new ApiError\("Classes are set up by your campus admin\.", 403\)/);
  assert.match(route, /if \(!canManageCampusOps\(user\)\) throw new ApiError\("Classes are archived by your campus admin\.", 403\)/);
  assert.match(route, /Move them to another class before archiving it/);
  assert.doesNotMatch(route, /tx\.class\.delete|prisma\.class\.delete/);
  assert.equal(route.match(/auditLog\.create\(\{ data: \{ schoolId: user\.schoolId/g)?.length, 2);
  assert.match(route, /findDuplicateClass\(prisma, \{ schoolId: user\.schoolId, campusId: archived\.campusId \}/);
  assert.match(route, /capacity \}/);
});

test("every new class-setup string has Arabic and Urdu", () => {
  for (const [en, ar, ur] of classSetupUiEntries) {
    assert.ok(ar && ur, en);
    assert.ok(reviewedTranslation(en, "ar"), en);
    assert.ok(reviewedTranslation(en, "ur"), en);
  }
});
