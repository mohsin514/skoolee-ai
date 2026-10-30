import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../src/lib/auth";
import { exportAuditHistory } from "../../src/lib/audit-history";

// SKAI-1065: a retried export with the same requestKey is byte-identical, leaves one receipt and never lists receipts.
type Row = { id: string; schoolId: string; campusId: string | null; tableName: string; recordId: string; userId: string; createdAt: Date; oldValue: unknown; newValue: unknown; retentionUntil: null };

function fakeDb() {
  const rows: Row[] = [];
  let seq = 0;
  const add = (data: Partial<Row>) => { const row = { id: `r${String(++seq).padStart(4, "0")}`, campusId: "campus-a", createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, seq)), oldValue: null, retentionUntil: null, ...data } as Row; rows.push(row); return row; };
  const matches = (where: { AND?: Array<Record<string, unknown>> }, row: Row) => (where.AND ?? []).every(c => (c.tableName === undefined || typeof c.tableName !== "string" || c.tableName === row.tableName) && (c.recordId === undefined || c.recordId === row.recordId));
  const db = {
    campus: { findMany: async () => [{ id: "campus-a", name: "A" }] },
    user: { findMany: async () => [{ id: "u1", fullName: "Admin One", role: "CAMPUS_ADMIN" }] },
    auditLog: {
      findFirst: async ({ where }: { where: { AND: Array<Record<string, unknown>> } }) => rows.find(r => matches(where, r)) ?? null,
      findMany: async ({ take }: { take: number }) => [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take),
      create: async ({ data }: { data: Partial<Row> }) => add(data),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find(r => r.id === where.id)!, data),
    },
  };
  return { db: db as never, rows, add };
}

const admin = { userId: "u1", email: "a@example.invalid", role: "CAMPUS_ADMIN", schoolId: "s1", campusId: "campus-a", accessVersion: 0 } as AuthUser;
const allow = async () => true;

test("same requestKey returns a byte-identical export with exactly one receipt", async () => {
  const { db, rows, add } = fakeDb();
  add({ schoolId: "s1", tableName: "students", recordId: "st1", userId: "u1", newValue: { status: "ACTIVE" } });
  const key = randomUUID();
  const first = await exportAuditHistory(admin, { requestKey: key }, allow, db, new Date("2026-10-29T10:00:00Z"));
  add({ schoolId: "s1", tableName: "students", recordId: "st2", userId: "u1", newValue: { status: "ACTIVE" } });
  const retry = await exportAuditHistory(admin, { requestKey: key }, allow, db, new Date("2026-10-30T10:00:00Z"));
  assert.deepEqual(retry, first);
  assert.equal(rows.filter(r => r.tableName === "audit_log_exports" && r.recordId === key).length, 1);
  assert.equal(first.csv.includes("audit_log_exports"), false, "the export excludes its own receipt");
});

test("a new requestKey never lists earlier receipts", async () => {
  const { db, add } = fakeDb();
  add({ schoolId: "s1", tableName: "students", recordId: "st1", userId: "u1", newValue: { status: "ACTIVE" } });
  await exportAuditHistory(admin, { requestKey: randomUUID() }, allow, db);
  const second = await exportAuditHistory(admin, { requestKey: randomUUID() }, allow, db);
  assert.equal(second.rows, 1);
  assert.equal(second.csv.includes("audit_log_exports"), false);
});

test("reusing a requestKey with different filters is rejected", async () => {
  const { db } = fakeDb();
  const key = randomUUID();
  await exportAuditHistory(admin, { requestKey: key }, allow, db);
  await assert.rejects(() => exportAuditHistory(admin, { requestKey: key, tableName: "students" }, allow, db), { status: 409 });
});

test("a retry still replays when the stored filters come back in a different key order (JSONB)", async () => {
  const { db, rows, add } = fakeDb();
  add({ schoolId: "s1", tableName: "students", recordId: "st1", userId: "u1", newValue: { status: "ACTIVE" } });
  const key = randomUUID();
  const input = { requestKey: key, from: "2026-10-01", to: "2026-10-29" };
  const first = await exportAuditHistory(admin, input, allow, db, new Date("2026-10-29T10:00:00Z"));
  // Postgres JSONB stores object keys shortest-first, so the receipt reads back reordered.
  const receipt = rows.find(r => r.tableName === "audit_log_exports" && r.recordId === key)!;
  const stored = receipt.newValue as { filters: Record<string, unknown> };
  stored.filters = Object.fromEntries(Object.entries(stored.filters).sort(([a], [b]) => a.length - b.length || a.localeCompare(b)));
  const retry = await exportAuditHistory(admin, input, allow, db, new Date("2026-10-30T10:00:00Z"));
  assert.deepEqual(retry, first);
});
