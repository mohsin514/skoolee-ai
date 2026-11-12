import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// SKAI-1845 (DB-01 Phase 1c): the campus foreign key on core tables covers (school_id, campus_id), so a row of
// school A can never name a campus of school B, while moving between two campuses of one school still works.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw Error("Only a local throwaway database is allowed");

const db = new PrismaClient();
type Fixture = Awaited<ReturnType<typeof seedSchool>>;
let a: Fixture, b: Fixture;

async function seedSchool(label: string) {
  const schoolId = `cp1845-${label}-${randomUUID()}`, campusId = randomUUID(), secondCampusId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: `Synthetic ${label} School`, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${label} Main`, regId: campusId, city: "Karachi" } });
  await db.campus.create({ data: { id: secondCampusId, schoolId, name: `${label} North`, regId: secondCampusId, city: "Karachi" } });
  const cls = await db.class.create({ data: { schoolId, campusId, name: "Seven", academicYear: 2026 } });
  return { schoolId, campusId, secondCampusId, classId: cls.id };
}

const code = async (run: () => Promise<unknown>) => (await run().then(() => null, (e: unknown) => e) as { code?: string } | null)?.code;

before(async () => { a = await seedSchool("A"); b = await seedSchool("B"); });
after(async () => {
  for (const s of [a, b]) if (s) await db.school.delete({ where: { id: s.schoolId } }).catch(() => undefined);
  await db.$disconnect();
});

test("a class or subject of school A cannot be placed on a campus of school B", async () => {
  assert.equal(await code(() => db.class.create({ data: { schoolId: a.schoolId, campusId: b.campusId, name: "Crossed", academicYear: 2026 } })), "P2003");
  assert.equal(await code(() => db.subject.create({ data: { schoolId: a.schoolId, campusId: b.campusId, classId: a.classId, name: "Crossed" } })), "P2003");
  assert.equal(await db.class.count({ where: { schoolId: a.schoolId, campusId: b.campusId } }), 0);
});

test("an existing class cannot be moved onto another school's campus", async () => {
  // A name school B's campus does not use, so the class-name unique cannot refuse it first.
  const cls = await db.class.create({ data: { schoolId: a.schoolId, campusId: a.campusId, name: `Move-${randomUUID().slice(0, 8)}`, academicYear: 2026 } });
  assert.equal(await code(() => db.class.update({ where: { id: cls.id }, data: { campusId: b.campusId } })), "P2003");
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: cls.id } })).campusId, a.campusId);
});

test("rows can still use, and move between, campuses of their own school", async () => {
  const cls = await db.class.create({ data: { schoolId: a.schoolId, campusId: a.secondCampusId, name: "Eight", academicYear: 2026 } });
  await db.class.update({ where: { id: cls.id }, data: { campusId: a.campusId } });
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: cls.id } })).campusId, a.campusId);
});

test("every pinned table's campus foreign key covers school_id and campus_id", async () => {
  const tables = ["classes", "students", "attendance", "marks", "report_cards", "exams", "subjects", "invoices", "payments", "ledger_entries", "online_payment_orders", "financial_adjustments", "payment_plans", "guardian_relationships"];
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT rel.relname::text AS table_name
    FROM pg_constraint k JOIN pg_class rel ON rel.oid = k.conrelid
    WHERE k.contype = 'f' AND k.confrelid = 'public.campuses'::regclass AND rel.relname = ANY(${tables})
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid = k.conrelid AND a.attnum = ANY (k.conkey)) = ARRAY['campus_id', 'school_id']`;
  assert.deepEqual(rows.map((r) => r.table_name).sort(), [...tables].sort());
});
