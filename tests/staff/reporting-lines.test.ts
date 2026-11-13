import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-127 (PM-04.09): secondary reporting lines are created and ended only by
// campus operators, only between active staff of the caller's own school, never
// to oneself or twice, and ending keeps the row (history) instead of deleting it.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

const A1 = "00000000-0000-4000-8000-0000000000a1";
const A2 = "00000000-0000-4000-8000-0000000000a2";
const B1 = "00000000-0000-4000-8000-0000000000b1";
type Staff = { id: string; schoolId: string; isActive: boolean };
type Line = { id: string; schoolId: string; userId: string; managerId: string; kind: string; label: string | null; endedAt: Date | null };
const staff: Staff[] = [
  { id: A1, schoolId: "school-a", isActive: true },
  { id: A2, schoolId: "school-a", isActive: true },
  { id: B1, schoolId: "school-b", isActive: true },
];
let lines: Line[] = [];
let audits: string[] = [];
type U = { userId: string; role: string; schoolId: string; ops: boolean; denied?: boolean };
let user: U = { userId: "admin-a", role: "SCHOOL_ADMIN", schoolId: "school-a", ops: true };

// The fail-closed tenant guard adds the caller's schoolId to every query; mirror that here.
const inSchool = <T extends { schoolId: string }>(r: T) => r.schoolId === user.schoolId;
const db = {
  user: { findFirst: async ({ where }: { where: { id: string; isActive: boolean } }) => staff.find(s => inSchool(s) && s.id === where.id && s.isActive === where.isActive) ?? null },
  staffReportingLine: {
    findFirst: async ({ where }: { where: Partial<Line> }) => lines.find(l => inSchool(l) && Object.entries(where).every(([k, v]) => (l as Record<string, unknown>)[k] === v)) ?? null,
    create: async ({ data }: { data: Omit<Line, "id" | "schoolId" | "endedAt"> }) => { const l = { ...data, id: `line-${lines.length + 1}`, schoolId: user.schoolId, endedAt: null }; lines.push(l); return l; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Line> }) => Object.assign(lines.find(l => l.id === where.id)!, data),
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: { ...db, $transaction: async (fn: (t: typeof db) => unknown) => fn(db) } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_tx: unknown, _u: unknown, e: { action: string }) => { audits.push(e.action); } } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  canManageCampusOps: (u: U) => u.ops,
  assertPermission: async (u: U) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? (e.name === "ZodError" ? 400 : 500) }),
} });

const route = () => import("../../src/app/api/staff/reporting-lines/route");
const post = async (body: unknown) => {
  const { POST } = await route();
  const res = await POST(new Request("http://x/api/staff/reporting-lines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
  return { status: res.status, body: await res.json() };
};
const del = async (id: string) => {
  const { DELETE } = await route();
  const { NextRequest } = await import("next/server");
  return (await DELETE(new NextRequest(`http://x/api/staff/reporting-lines?id=${id}`, { method: "DELETE" }))).status;
};
const reset = (u: Partial<U> = {}) => { lines = []; audits = []; user = { userId: "admin-a", role: "SCHOOL_ADMIN", schoolId: "school-a", ops: true, ...u }; };

test("a campus operator adds a dotted line inside their school, audited", async () => {
  reset();
  const { status, body } = await post({ userId: A1, managerId: A2, kind: "FUNCTIONAL", label: "Exam duty" });
  assert.equal(status, 201);
  assert.equal(body.line.kind, "FUNCTIONAL");
  assert.equal(lines.length, 1);
  assert.deepEqual(audits, ["CREATE"]);
});

test("self-reporting and duplicate live lines are rejected without writes", async () => {
  reset();
  assert.equal((await post({ userId: A1, managerId: A1 })).status, 400);
  assert.equal((await post({ userId: A1, managerId: A2 })).status, 201);
  assert.equal((await post({ userId: A1, managerId: A2 })).status, 409);
  assert.equal(lines.length, 1);
});

test("another school's staff cannot be linked from either side", async () => {
  reset();
  assert.equal((await post({ userId: A1, managerId: B1 })).status, 404);
  reset({ schoolId: "school-b", userId: "admin-b" });
  assert.equal((await post({ userId: B1, managerId: A1 })).status, 404);
  assert.equal(lines.length, 0);
});

test("denied roles cannot add or end lines", async () => {
  reset({ role: "TEACHER", ops: false });
  assert.equal((await post({ userId: A1, managerId: A2 })).status, 403);
  reset({ denied: true });
  assert.equal((await post({ userId: A1, managerId: A2 })).status, 403);
  assert.equal(lines.length, 0);
});

test("ending a line keeps history and frees the pair; other schools cannot end it", async () => {
  reset();
  await post({ userId: A1, managerId: A2 });
  const id = lines[0].id;
  user = { ...user, schoolId: "school-b" };
  assert.equal(await del(id), 404);
  assert.equal(lines[0].endedAt, null);
  user = { ...user, schoolId: "school-a" };
  assert.equal(await del(id), 200);
  assert.notEqual(lines[0].endedAt, null);
  assert.equal((await post({ userId: A1, managerId: A2 })).status, 201);
  assert.equal(lines.length, 2);
});

test("invalid ids are rejected", async () => {
  reset();
  assert.notEqual((await post({ userId: "nope", managerId: A2 })).status, 201);
  assert.equal(lines.length, 0);
});
