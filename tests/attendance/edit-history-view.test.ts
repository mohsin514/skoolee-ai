import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../../src/lib/db/prisma";
import { entryHistory } from "../../src/lib/attendance/register";

// SKAI-230: attendance edit history was recorded but no screen showed it. The register row now opens a
// history dialog fed by the scoped `?history=` read; these tests pin the read's scoping and the UI wiring.
const rows = [
  { id: "att-a", schoolId: "school-a", campusId: "campus-a1", classId: null, status: "EXCUSED", version: 2, markedBy: "u-t",
    editHistory: [{ id: "h1", editedAt: new Date("2026-11-01T08:00:00Z"), oldStatus: "UNMARKED", newStatus: "ABSENT", editedBy: "u-t", reason: null, source: "REGISTER" },
      { id: "h2", editedAt: new Date("2026-11-02T08:00:00Z"), oldStatus: "ABSENT", newStatus: "EXCUSED", editedBy: "u-t", reason: "Doctor's note", source: "EXPLANATION" }], explanations: [] },
];
type Where = { id: string; schoolId: string; campusId?: string };
const db = prisma as unknown as Record<string, Record<string, unknown>>;
db.attendance = { findFirst: async ({ where }: { where: Where }) => rows.find(r => r.id === where.id && r.schoolId === where.schoolId && (where.campusId === undefined || r.campusId === where.campusId)) ?? null };
db.user = { findMany: async ({ where }: { where: { schoolId: string } }) => where.schoolId === "school-a" ? [{ id: "u-t", fullName: "Teacher A" }] : [] };

after(() => { setImmediate(() => process.exit(process.exitCode ?? 0)); });
const admin = (schoolId: string, campusId: string) => ({ userId: "adm", schoolId, campusId, role: "ADMIN" }) as never;

test("a permitted admin sees the day's changes oldest first with id, actor, source and reason", async () => {
  const out = await entryHistory(admin("school-a", "campus-a1"), "att-a");
  assert.deepEqual(out.changes.map(c => c.id), ["h1", "h2"]);
  assert.equal(out.changes[1].by, "Teacher A");
  assert.equal(out.changes[1].source, "EXPLANATION");
});

test("another school or another campus gets not found, never the history", async () => {
  await assert.rejects(entryHistory(admin("school-b", "campus-b1"), "att-a"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(entryHistory(admin("school-a", "campus-a2"), "att-a"), (e: { status?: number }) => e.status === 404);
});

test("a parent cannot read register history", async () => {
  await assert.rejects(entryHistory({ userId: "p", schoolId: "school-a", campusId: "campus-a1", role: "PARENT" } as never, "att-a"), (e: { status?: number }) => e.status === 403);
});

test("the register row offers the history only for a recorded mark and reads the scoped API", () => {
  const ui = readFileSync("src/components/attendance/class-register.tsx", "utf8");
  assert.match(ui, /entry\.attendanceId \? <Button/);
  assert.match(ui, /\/api\/attendance\/register\?history=\$\{encodeURIComponent\(attendanceId\)\}/);
  assert.match(readFileSync("src/lib/attendance/register.ts", "utf8"), /attendanceId: row\?\.id \?\? null/);
});
