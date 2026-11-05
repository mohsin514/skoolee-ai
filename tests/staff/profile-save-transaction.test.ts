import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1253: saving a staff record with regulator fields hit P2028 because work inside the interactive
// transaction escaped to a second pooled connection (nested RLS transaction, SKAI-1303; audit prior-row
// read on the base client, SKAI-1443). This locks in the shape that keeps the save inside one connection:
// reads and validation before the transaction, only batched writes inside it, every write on `tx`.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/staff/profile/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Call = { on: "base" | "tx"; op: string; inTx: boolean; args?: any };

function load(opts: { schoolId?: string; failAudit?: boolean } = {}) {
  const schoolId = opts.schoolId ?? "school-a";
  const calls: Call[] = [];
  const committed: string[] = [];
  let inTx = false;
  const staffRows = [{ id: "t-1", schoolId: "school-a", fullName: "Synthetic Teacher", staffProfile: { id: "sp-1", designation: "Teacher", contractType: "CONTRACT", basicSalary: 100000 } }];
  const base = {
    user: {
      findFirst: async (a: any) => {
        calls.push({ on: "base", op: "user.findFirst", inTx, args: a });
        return staffRows.find((row) => row.id === a.where.id && row.schoolId === a.where.schoolId) ?? null;
      },
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const pending: string[] = [];
      const tx = {
        staffProfile: { upsert: async (a: any) => { calls.push({ on: "tx", op: "staffProfile.upsert", inTx, args: a }); pending.push("profile"); return { id: "sp-1", ...a.update }; } },
        staffTimelineEvent: { createMany: async (a: any) => { calls.push({ on: "tx", op: "staffTimelineEvent.createMany", inTx, args: a }); pending.push("timeline"); return { count: a.data.length }; } },
      };
      inTx = true;
      try {
        const result = await fn(tx);
        committed.push(...pending);
        return result;
      } finally { inTx = false; }
    },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: base };
    if (id === "@/lib/auth/policy") return { campusScope: (u: any) => ({ schoolId: u.schoolId }) };
    if (id === "@/lib/audit-events") return {
      writeAuditEvent: async (client: any, _user: any, event: any) => {
        calls.push({ on: client === base ? "base" : "tx", op: "audit", inTx, args: event });
        if (opts.failAudit) throw new Error("audit write failed");
      },
    };
    if (id === "@/lib/api/scope") return {
      ApiError,
      requireAuthUser: async () => ({ userId: "admin-1", role: "ADMIN", schoolId, campusId: null }),
      canManageCampusOps: () => true,
      assertPermission: async () => {},
      errorResponse: (e: any) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
    };
    return require(id);
  });
  const patch = (body: Record<string, unknown>) => mod.exports.PATCH({ json: async () => body, text: async () => JSON.stringify(body), headers: new Headers({ "content-type": "application/json" }) });
  return { patch, calls, committed };
}

const regulatorSave = { userId: "t-1", designation: "Senior Teacher", contractType: "PERMANENT", basicSalary: 150000, emiratesId: "784-1990-1234567-6", nationality: "AE" };

test("regulator save reads before the transaction and writes only on tx, in one batch", async () => {
  const f = load();
  const res = await f.patch(regulatorSave);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  // Lookup and validation happen outside; nothing inside the callback touches the base client.
  assert.deepEqual(f.calls.filter((c) => !c.inTx).map((c) => c.op), ["user.findFirst"]);
  assert.ok(f.calls.filter((c) => c.inTx).every((c) => c.on === "tx"), "every in-transaction call uses tx");
  assert.deepEqual(f.calls.filter((c) => c.inTx).map((c) => c.op), ["staffProfile.upsert", "staffTimelineEvent.createMany", "audit"]);
  // Timeline events are batched into a single createMany, not one insert per change.
  assert.equal(f.calls.find((c) => c.op === "staffTimelineEvent.createMany")!.args.data.length, 3);
  assert.deepEqual(f.committed, ["profile", "timeline"]);
  // The audit trail keeps regulator IDs masked.
  const audit = f.calls.find((c) => c.op === "audit")!.args;
  assert.ok(!JSON.stringify(audit).includes("1234567"), "full Emirates ID never reaches the audit row");
});

test("a failing audit write rolls back the profile and timeline writes", async () => {
  const f = load({ failAudit: true });
  const res = await f.patch(regulatorSave);
  assert.equal(res.status, 500);
  assert.deepEqual(f.committed, [], "nothing commits without its audit row");
});

test("a malformed regulator value is refused before any transaction opens", async () => {
  const f = load();
  const res = await f.patch({ userId: "t-1", emiratesId: "not-an-id" });
  assert.equal(res.status, 400);
  assert.equal(f.calls.some((c) => c.inTx), false);
});

test("another school cannot save school A's staff record", async () => {
  const f = load({ schoolId: "school-b" });
  const res = await f.patch(regulatorSave);
  assert.equal(res.status, 404);
  assert.equal(f.calls[0].args.where.schoolId, "school-b");
  assert.equal(f.calls.some((c) => c.inTx), false);
  assert.deepEqual(f.committed, []);
});
