import assert from "node:assert/strict";
import { mock, test } from "node:test";

let committed: Record<string, unknown> | null = null;
let auditFails = false;
const audited: string[] = [];

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      school: { findUnique: async () => ({ id: "school-a", name: "QA-01", status: "ACTIVE", plan: "BASIC", dataRegion: "PK", attendanceRegulator: "NONE" }) },
      // A minimal transaction: writes are staged and only committed when the callback resolves.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        let staged: Record<string, unknown> | null = null;
        const tx = { school: { update: async ({ data }: { data: Record<string, unknown> }) => { staged = data; } } };
        const result = await fn(tx);
        committed = staged;
        return result;
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
    errorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    requirePlatformOwner: async () => ({ userId: "owner-1" }),
  },
});
mock.module("@/lib/audit", {
  namedExports: {
    logSuperAdminAction: async (entry: { action: string }, db: unknown) => {
      assert.ok(db, "audit is written with the transaction client");
      if (auditFails) throw new Error("audit store unavailable");
      audited.push(entry.action);
    },
  },
});
mock.module("@/config/commercial-contract", { namedExports: { createPlanContract: () => ({ aiCredits: 100 }) } });
mock.module("@/lib/school/data-region", { namedExports: { parseDataRegion: (v: string) => v } });
mock.module("@/lib/attendance/regulator", { namedExports: { parseAttendanceRegulator: (v: string) => v } });
mock.module("@/lib/api/validate", { namedExports: { parseBody: async (req: { body: unknown }) => req.body } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });

const patch = async (body: Record<string, unknown>) => {
  const { PATCH } = await import("../../src/app/api/owner/schools/[id]/route");
  return PATCH({ body } as never, { params: Promise.resolve({ id: "school-a" }) });
};

test("a failed owner audit rolls the school change back and returns an error", async () => {
  committed = null; auditFails = true; audited.length = 0;
  const res = await patch({ status: "SUSPENDED" });
  assert.equal(res.status, 500);
  assert.equal(committed, null);
});

test("a successful change commits with one audit entry per changed field", async () => {
  committed = null; auditFails = false; audited.length = 0;
  const res = await patch({ status: "SUSPENDED", plan: "PRO" });
  assert.equal(res.status, 200);
  assert.equal((committed as Record<string, unknown> | null)?.status, "SUSPENDED");
  assert.deepEqual(audited.sort(), ["plan_changed", "school_suspended"]);
});
