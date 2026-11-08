import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

// SKAI-1783: a provider receipt that says "failed" is FAILED in the communication log's filter and counter.
type Row = { id: string; schoolId: string; campusId: string; status: string; channel: string; templateKey: string; relatedType: string | null; sentAt: Date | null; deliveryReceipts: { state: string }[] };
const rows: Row[] = [];
const row = (id: string, schoolId: string, status: string, receipts: string[] = []): Row =>
  ({ id, schoolId, campusId: schoolId.replace("school", "campus"), status, channel: "WHATSAPP", templateKey: "FEE_REMINDER", relatedType: null, sentAt: new Date(), deliveryReceipts: receipts.map((state) => ({ state })) });

// Evaluates the where shapes the route builds (equality, not, in, AND, OR, relation some/none).
type Where = Record<string, unknown>;
const holds = (r: Row, where: Where): boolean => Object.entries(where).every(([key, cond]) => {
  if (key === "AND") return (cond as Where[]).every((w) => holds(r, w));
  if (key === "OR") return (cond as Where[]).some((w) => holds(r, w));
  if (key === "deliveryReceipts") {
    const c = cond as { some?: { state: string }; none?: { state: string } };
    if (c.some) return r.deliveryReceipts.some((d) => d.state === c.some!.state);
    return !r.deliveryReceipts.some((d) => d.state === c.none!.state);
  }
  const value = (r as unknown as Record<string, unknown>)[key];
  if (cond && typeof cond === "object") {
    const c = cond as { not?: unknown; in?: unknown[] };
    if ("not" in c) return value !== c.not;
    if (c.in) return c.in.includes(value);
  }
  return value === cond;
});

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const ops = (school: "a" | "b") => ({ userId: `ops-${school}`, role: "CAMPUS_ADMIN", schoolId: `school-${school}`, campusId: `campus-${school}` });
const state = { user: ops("a") as Record<string, string> };
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      parentCommunication: {
        findMany: async ({ where }: { where: Where }) => rows.filter((r) => holds(r, where)).map((r) => ({ ...r, student: null, parent: null, campus: null })),
        groupBy: async ({ where }: { where: Where }) => {
          const counts = new Map<string, number>();
          for (const r of rows.filter((x) => holds(x, where))) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
          return [...counts].map(([status, n]) => ({ status, _count: { _all: n } }));
        },
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageAcademics: (u: { role: string }) => ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN", "PRINCIPAL"].includes(u.role),
    canManageCampusOps: (u: { role: string }) => ["SUPER_ADMIN", "CAMPUS_ADMIN", "ADMIN"].includes(u.role),
    errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof ApiError ? e.status : 500 }),
  },
});
mock.module("@/lib/notifications/automation", { namedExports: { runNotificationAutomationSweep: async () => [] } });
mock.module("@/lib/school-ai/announcement-history", { namedExports: { announcementHistoryRestriction: async () => ({}) } });

const log = async (query = "") => {
  const { GET } = await import("../../src/app/api/communications/route");
  const res = await GET(new Request(`http://local/api/communications?${query}`) as never);
  const body = await res.json();
  return { status: res.status, ids: (body.communications ?? []).map((c: { id: string }) => c.id).sort(), summary: body.summary };
};

beforeEach(() => {
  rows.length = 0;
  rows.push(
    row("sent-ok", "school-a", "SENT", ["delivered"]),
    row("sent-receipt-failed", "school-a", "SENT", ["failed"]),
    row("send-failed", "school-a", "FAILED"),
    row("send-failed-and-receipt", "school-a", "FAILED", ["failed"]),
    row("other-school-receipt-failed", "school-b", "SENT", ["failed"]),
  );
  state.user = ops("a");
});

test("the Failed filter includes a receipt-confirmed failure; Sent no longer does", async () => {
  assert.deepEqual((await log("status=FAILED")).ids, ["send-failed", "send-failed-and-receipt", "sent-receipt-failed"]);
  assert.deepEqual((await log("status=SENT")).ids, ["sent-ok"]);
});

test("the counter moves receipt failures to FAILED and counts a raw FAILED row once", async () => {
  const { summary } = await log();
  assert.deepEqual(summary, { SENT: 1, FAILED: 3 });
});

test("the unfiltered log is unchanged and two schools stay isolated", async () => {
  assert.deepEqual((await log()).ids, ["send-failed", "send-failed-and-receipt", "sent-ok", "sent-receipt-failed"]);
  state.user = ops("b");
  const b = await log("status=FAILED");
  assert.deepEqual(b.ids, ["other-school-receipt-failed"]);
  assert.deepEqual(b.summary, { SENT: 0, FAILED: 1 });
});

test("roles outside the communication log are refused with 403", async () => {
  for (const role of ["TEACHER", "PARENT", "ACCOUNTANT"]) {
    state.user = { ...ops("a"), role };
    assert.equal((await log()).status, 403, role);
  }
});
