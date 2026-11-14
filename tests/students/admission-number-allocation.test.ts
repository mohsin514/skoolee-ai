import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { admissionNumberAllocator, formatAdmissionNo, highestAdmissionSeq } from "../../src/lib/students/admission-number";

// In-memory stand-in for Postgres: a per-key advisory lock held until the "transaction" ends, plus a student table.
function fakeDb(seed: { schoolId: string; admissionNo: string | null }[] = []) {
  const rows = [...seed], locks = new Map<string, Promise<void>>();
  async function transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const held: (() => void)[] = [];
    const tx = {
      async $executeRaw(_q: TemplateStringsArray, key: string) {
        while (locks.has(key)) await locks.get(key);
        let release!: () => void; locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; })); held.push(release);
      },
      async $queryRaw(_q: TemplateStringsArray, schoolId: string, like: string) { await new Promise((r) => setTimeout(r, 1)); const prefix = like.slice(0, -1); return rows.filter((r) => r.schoolId === schoolId && r.admissionNo?.startsWith(prefix)).map((r) => ({ admission_no: r.admissionNo })); },
      student: {
        async create(data: { schoolId: string; admissionNo: string }) { await new Promise((r) => setTimeout(r, 1)); rows.push(data); },
      },
    };
    try { return await fn(tx); } finally { held.forEach((r) => r()); }
  }
  return { rows, transaction };
}

test("format is unchanged: ADM-<year>-<4-digit sequence>", () => {
  assert.equal(formatAdmissionNo(2026, 1), "ADM-2026-0001");
  assert.equal(formatAdmissionNo(2026, 12345), "ADM-2026-12345");
});

test("continues after the highest issued number and ignores other years and formats", () => {
  assert.equal(highestAdmissionSeq(2026, ["ADM-2026-0007", "ADM-2026-0003", "ADM-2025-0099", "ADM-2026-ABCDEF", null, "X-1"]), 7);
});

test("concurrent allocations in one school never repeat, even across campuses", async () => {
  const db = fakeDb([{ schoolId: "s1", admissionNo: "ADM-2026-0002" }]);
  await Promise.all(Array.from({ length: 20 }, () => db.transaction(async (tx) => {
    const next = await admissionNumberAllocator(tx, "s1", 2026);
    await tx.student.create({ schoolId: "s1", admissionNo: next() });
    await tx.student.create({ schoolId: "s1", admissionNo: next() });
  })));
  const numbers = db.rows.map((r) => r.admissionNo);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(numbers.length, 41);
  assert.ok(numbers.includes("ADM-2026-0042"));
});

test("two schools keep separate sequences", async () => {
  const db = fakeDb([{ schoolId: "s1", admissionNo: "ADM-2026-0005" }]);
  const [a, b] = await Promise.all(["s1", "s2"].map((school) => db.transaction(async (tx) => (await admissionNumberAllocator(tx, school, 2026))())));
  assert.equal(a, "ADM-2026-0006");
  assert.equal(b, "ADM-2026-0001");
});

test("year close uses the shared allocator, not a campus count", () => {
  const route = readFileSync("src/app/api/academic-year/route.ts", "utf8");
  assert.match(route, /admissionNumberAllocator\(tx, user\.schoolId, academicYear\)/);
  assert.doesNotMatch(route, /count\s*\+\s*1/);
});
