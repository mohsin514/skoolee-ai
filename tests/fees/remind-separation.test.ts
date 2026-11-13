import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/fees/remind/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;
const students = [
  { id: "s-a", schoolId: "school-a", campusId: "campus-a", invoices: [{ id: "inv-a", balanceDue: 500, dueDate: new Date(), status: "PENDING" }] },
  { id: "s-b", schoolId: "school-b", campusId: "campus-b", invoices: [{ id: "inv-b", balanceDue: 500, dueDate: new Date(), status: "PENDING" }] },
];
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

function fixture(opts: { role?: string; schoolId?: string; campusId?: string; requiredFor?: string[] }) {
  const sent: string[] = []; const policyChecks: Array<[string, string | null]> = [];
  const user = { userId: "u1", role: opts.role ?? "ACCOUNTANT", schoolId: opts.schoolId ?? "school-a", campusId: opts.campusId ?? "campus-a" };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: { student: { findFirst: async ({ where }: any) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId && (!where.campusId || s.campusId === where.campusId)) ?? null } } };
    if (id === "@/lib/api/scope") return { ApiError, requireAuthUser: async () => user, assertPermission: async () => undefined, errorResponse: (e: any) => Response.json({ error: e.message }, { status: e.status ?? 500 }) };
    if (id === "@/lib/auth/policy") return { campusScope: (u: any) => ({ schoolId: u.schoolId, campusId: u.campusId }) };
    if (id === "@/lib/auth/same-origin") return { assertSameOrigin: () => undefined };
    if (id === "@/lib/school-ai/http") return { readBoundedJson: async (req: Request) => req.json() };
    if (id === "@/lib/fees/collect-command") return { moneySeparationRequired: async (u: any, campusId: string | null) => { policyChecks.push([u.schoolId, campusId]); return (opts.requiredFor ?? []).includes(u.schoolId); } };
    if (id === "@/lib/notifications/service") return { sendStudentTemplatedCommunication: async (input: any) => { sent.push(input.relatedId); return [{ id: "c1", status: "SENT" }]; } };
    return require(id);
  });
  const post = (studentId: string) => mod.exports.POST(new Request("http://qa.test/api/fees/remind", { method: "POST", body: JSON.stringify({ studentId }) }));
  return { post, sent, policyChecks };
}

test("separation REQUIRED blocks a one-person reminder send (409) and sends nothing", async () => {
  const f = fixture({ requiredFor: ["school-a"] });
  const res = await f.post("s-a");
  assert.equal(res.status, 409);
  assert.deepEqual(f.sent, []);
  assert.deepEqual(f.policyChecks, [["school-a", "campus-a"]]);
});

test("separation not required still sends; policy is read per school and campus", async () => {
  const f = fixture({ schoolId: "school-b", campusId: "campus-b", requiredFor: ["school-a"] });
  const res = await f.post("s-b");
  assert.equal(res.status, 200);
  assert.deepEqual(f.sent, ["inv-b"]);
  assert.deepEqual(f.policyChecks, [["school-b", "campus-b"]]);
});

test("another school's or campus's student is not found and nothing is sent", async () => {
  const f = fixture({ schoolId: "school-b", campusId: "campus-b" });
  assert.equal((await f.post("s-a")).status, 404);
  assert.deepEqual(f.sent, []);
});

test("denied roles cannot send reminders", async () => {
  for (const role of ["PARENT", "STUDENT", "TEACHER"]) {
    const f = fixture({ role });
    assert.equal((await f.post("s-a")).status, 403);
    assert.deepEqual(f.sent, []);
  }
});
