import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/fees/collect/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const invoices = [
  { id: "inv-main", schoolId: "school-a", campusId: "campus-1" },
  { id: "inv-other", schoolId: "school-a", campusId: "campus-2" },
];

function get(role: string, invoiceId: string, campusId = "campus-1", canViewFees = true) {
  const user = { userId: "u1", role, schoolId: "school-a", campusId };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: { invoice: { findFirst: async ({ where }: any) => invoices.find((i) => i.id === where.id && i.schoolId === where.student.schoolId && (!where.student.campusId || i.campusId === where.student.campusId)) ?? null } } };
    if (id === "@/lib/api/scope") return {
      ApiError, requireAuthUser: async () => user, assertPermission: async () => undefined, assertStaffRole: () => undefined,
      assertFeesRead: async (u: any) => { if (["STUDENT", "PARENT"].includes(u.role) || !canViewFees) throw new ApiError("forbidden", 403); },
      errorResponse: (e: any) => Response.json({ error: e.message }, { status: e.status ?? 500 }),
    };
    if (id === "@/lib/auth/policy") return { campusScope: (u: any) => ({ schoolId: u.schoolId, campusId: u.campusId }) };
    if (id === "@/lib/fees/collect-command") return {};
    if (id === "@/lib/notifications/in-app") return { notify: () => undefined };
    if (id === "@/lib/api/validate") return { parseBody: async () => ({}) };
    if (id === "@/lib/validators/route-bodies") return { jsonObjectBody: {} };
    return require(id);
  });
  return mod.exports.GET({ nextUrl: new URL(`http://qa.test/api/fees/collect?invoiceId=${invoiceId}`) } as any);
}

test("student, parent and teacher without fees.view get 403", async () => {
  for (const role of ["STUDENT", "PARENT"]) assert.equal((await get(role, "inv-main")).status, 403);
  assert.equal((await get("TEACHER", "inv-main", "campus-1", false)).status, 403);
});

test("finance staff read an invoice on their own campus", async () => {
  assert.equal((await get("ACCOUNTANT", "inv-main")).status, 200);
});

test("campus-pinned staff cannot read another campus's invoice", async () => {
  assert.equal((await get("ACCOUNTANT", "inv-other")).status, 404);
});
