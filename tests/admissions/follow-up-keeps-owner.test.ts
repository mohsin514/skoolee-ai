import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1778: logging a follow-up returns the enquiry with the same owner relation the list/detail uses.
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
type Row = { id: string; schoolId: string; campusId: string; status: string; nextFollowUp: Date | null; assignedToId: string | null; followUps: number };
const owners: Record<string, { id: string; fullName: string; role: string }> = { "staff-a": { id: "staff-a", fullName: "QA-01 reception2", role: "RECEPTIONIST" } };
let rows: Row[] = [];
const reset = () => { rows = [
  { id: "enq-a", schoolId: "school-a", campusId: "campus-a", status: "ACTIVE", nextFollowUp: null, assignedToId: "staff-a", followUps: 1 },
  { id: "enq-free", schoolId: "school-a", campusId: "campus-a", status: "ACTIVE", nextFollowUp: null, assignedToId: null, followUps: 0 },
  { id: "enq-b", schoolId: "school-b", campusId: "campus-b", status: "ACTIVE", nextFollowUp: null, assignedToId: "staff-a", followUps: 0 },
]; };
let user: { userId: string; role: string; schoolId: string; campusId: string; denied?: boolean } = { userId: "u", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" };
const shape = (r: Row, include?: Record<string, unknown>) => ({
  id: r.id, status: r.status, assignedToId: r.assignedToId,
  ...(include?.assignedTo ? { assignedTo: r.assignedToId ? owners[r.assignedToId] : null } : {}),
  ...(include?._count ? { _count: { followUps: r.followUps } } : {}),
});
const admissionQuery = {
  findFirst: async ({ where }: { where: { id: string; campus: { schoolId: string }; campusId?: string } }) => {
    const r = rows.find(x => x.id === where.id && x.schoolId === where.campus.schoolId && (!where.campusId || x.campusId === where.campusId));
    return r ? { ...r, convertedStudent: null } : null;
  },
  update: async ({ where, data, include }: { where: { id: string }; data: Partial<Row>; include?: Record<string, unknown> }) => {
    const r = rows.find(x => x.id === where.id)!;
    Object.assign(r, data);
    return shape(r, include);
  },
};
const tx = { admissionQuery, admissionQueryFollowUp: { create: async ({ data }: { data: { queryId: string } }) => { rows.find(x => x.id === data.queryId)!.followUps++; } } };
mock.module("@/lib/db/prisma", { namedExports: { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => null } });
mock.module("@/lib/api/scope", { namedExports: {
  ApiError,
  requireAuthUser: async () => user,
  assertStaffRole: () => {},
  assertModuleRead: async () => {},
  assertPermission: async (u: typeof user) => { if (u.denied) throw new ApiError("Forbidden", 403); },
  resolveCampusId: async (u: typeof user) => u.campusId,
  scopedCampusWhere: () => ({}),
  errorResponse: (e: ApiError) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
} });

const patch = async (body: unknown) => {
  const { PATCH } = await import("../../src/app/api/admission-queries/route");
  const res = await PATCH(new Request("http://x/api/admission-queries", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
  return { status: res.status, body: await res.json() };
};
const followUp = (id: string) => patch({ id, followUp: { note: "Called back" } });

test("a logged follow-up keeps the assigned owner and timeline count in the response", async () => {
  reset(); user = { userId: "u", role: "RECEPTIONIST", schoolId: "school-a", campusId: "campus-a" };
  const { status, body } = await followUp("enq-a");
  assert.equal(status, 200);
  assert.deepEqual(body.data.assignedTo, owners["staff-a"]);
  assert.equal(body.data._count.followUps, 2);
  assert.equal(rows[0].assignedToId, "staff-a");
});

test("a genuinely unassigned enquiry stays unassigned", async () => {
  reset();
  const { status, body } = await followUp("enq-free");
  assert.equal(status, 200);
  assert.equal(body.data.assignedTo, null);
});

test("a normal edit still returns the owner", async () => {
  reset();
  const { body } = await patch({ id: "enq-a", note: "Prefers mornings" });
  assert.deepEqual(body.data.assignedTo, owners["staff-a"]);
});

test("another school's enquiry is not found", async () => {
  reset();
  const { status } = await followUp("enq-b");
  assert.equal(status, 404);
  assert.equal(rows[2].followUps, 0);
});

test("a role without admissions.edit is refused", async () => {
  reset(); user = { ...user, denied: true };
  const { status } = await followUp("enq-a");
  assert.equal(status, 403);
  assert.equal(rows[0].followUps, 1);
});
