import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-130: the staff timeline is keyset-paginated, tie-broken by id, and names actors from the caller's school only.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/staff/profile/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function load(events: any[], query = "") {
  const calls: any = {};
  const db = {
    user: {
      findFirst: async (a: any) => { calls.findFirst = a; return { id: "t-1", staffDocuments: [], staffTimelineEvents: events }; },
      findMany: async (a: any) => { calls.findMany = a; return [{ id: "admin-1", fullName: "Synthetic Admin" }]; },
    },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/auth/policy") return { campusScope: (u: any) => ({ schoolId: u.schoolId, campusId: u.campusId }) };
    if (id === "@/lib/audit-events") return { writeAuditEvent: async () => {} };
    if (id === "@/lib/api/scope") return {
      ApiError,
      requireAuthUser: async () => ({ userId: "admin-1", role: "ADMIN", schoolId: "school-a", campusId: "campus-a" }),
      canManageCampusOps: () => true,
      assertPermission: async () => {},
    };
    return require(id);
  });
  return { res: mod.exports.GET({ nextUrl: new URL(`http://qa.test/api/staff/profile?userId=t-1${query}`) }), calls };
}

const ev = (i: number, actorId: string | null = "admin-1") => ({ id: `e-${i}`, kind: "PROFILE", title: `Event ${i}`, detail: null, createdAt: new Date(2026, 0, 1), actorId });

test("first page returns 50 events, a cursor, and stable ordering", async () => {
  const { res, calls } = load(Array.from({ length: 51 }, (_, i) => ev(i)));
  const body = await (await res).json();
  assert.equal(body.data.staffTimelineEvents.length, 50);
  assert.equal(body.data.staffTimelineNextCursor, "e-49");
  const tl = calls.findFirst.select.staffTimelineEvents;
  assert.deepEqual(tl.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(tl.take, 51);
  assert.equal(tl.cursor, undefined);
  assert.equal(body.data.staffTimelineEvents[0].actorName, "Synthetic Admin");
  assert.equal("actorId" in body.data.staffTimelineEvents[0], false);
  assert.deepEqual(calls.findMany.where, { id: { in: ["admin-1"] }, schoolId: "school-a" });
});

test("cursor page skips the cursor row; last page has no cursor; unknown actor is null", async () => {
  const { res, calls } = load([ev(50, "other-school-user"), ev(51, null)], "&timelineCursor=e-49");
  const body = await (await res).json();
  assert.deepEqual(calls.findFirst.select.staffTimelineEvents.cursor, { id: "e-49" });
  assert.equal(calls.findFirst.select.staffTimelineEvents.skip, 1);
  assert.equal(body.data.staffTimelineNextCursor, null);
  assert.equal(body.data.staffTimelineEvents[0].actorName, null);
  assert.equal(body.data.staffTimelineEvents[1].actorName, null);
});
