import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// SKAI-1885 (PERF-01): the hot invoice, notification, exam, student, subject and teaching-assignment filters
// each have an index that leads with their scope columns, so those reads stay bounded as rows accumulate.
const root = join(__dirname, "..", "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(join(root, "prisma", "migrations", "20261120010000_skai_1885_hot_filter_indexes", "migration.sql"), "utf8");

function modelIndexes(name: string): string[] {
  const block = schema.match(new RegExp(`^model ${name} \\{[\\s\\S]*?^\\}`, "m"));
  assert.ok(block, `model ${name} exists`);
  return [...block[0].matchAll(/^\s*@@(?:index|unique)\(\[([^\]]*)\]/gm)].map((m) => m[1].replace(/\s+/g, " ").trim());
}

const expected: Record<string, string[]> = {
  Invoice: ["campusId, invoiceDate(sort: Desc), id", "campusId, currency, dueDate"],
  Notification: ["userId, lastRemindedAt(sort: Desc), createdAt(sort: Desc)"],
  TeachingAssignment: ["schoolId, teacherId"],
  // Already added by SKAI-1806 / SKAI-1819; kept here so the hot paths named in SKAI-1885 cannot lose them.
  Student: ["classId"],
  Exam: ["campusId, academicYear", "classId"],
  Subject: ["teacherId"],
  ReportCard: ["examId"],
  Class: ["classTeacherId"],
};

for (const [model, indexes] of Object.entries(expected)) {
  test(`${model} declares the indexes its hot filters use`, () => {
    const declared = modelIndexes(model);
    for (const index of indexes) assert.ok(declared.includes(index), `${model} @@index([${index}]) missing; have ${JSON.stringify(declared)}`);
  });
}

test("the migration creates each new index additively, outside any data change", () => {
  const statements = migration.split("\n").filter((line) => line.trim() && !line.trim().startsWith("--"));
  assert.equal(statements.length, 4);
  for (const statement of statements) assert.match(statement, /^CREATE INDEX IF NOT EXISTS "\w+" ON "\w+"\(.+\);$/);
  assert.doesNotMatch(statements.join("\n"), /CONCURRENTLY|DROP |ALTER |UPDATE |DELETE /);
  assert.ok(migration.includes(`"invoices"("campus_id", "invoice_date" DESC, "id")`));
  assert.ok(migration.includes(`"invoices"("campus_id", "currency", "due_date")`));
  assert.ok(migration.includes(`"teaching_assignments"("school_id", "teacher_id")`));
});

test("the notification index matches the inbox order, including NULLS LAST", () => {
  const actions = readFileSync(join(root, "src", "lib", "notifications", "actions.ts"), "utf8");
  assert.ok(actions.includes(`orderBy: [{ lastRemindedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]`));
  assert.ok(migration.includes(`"notifications"("user_id", "last_reminded_at" DESC NULLS LAST, "created_at" DESC)`));
});

test("the invoice list order matches the invoice index", () => {
  const route = readFileSync(join(root, "src", "app", "api", "fees", "invoices", "route.ts"), "utf8");
  assert.ok(route.includes(`orderBy: [{ invoiceDate: "desc" }, { id: "asc" }]`));
});
