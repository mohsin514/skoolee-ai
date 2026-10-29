import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-1117: GET /api/staff/profile returns the teacher's led classes and taught subjects, school-scoped.
const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
const code = transformSync(readFileSync("src/app/api/staff/profile/route.ts", "utf8"), { loader: "ts", format: "cjs" }).code;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function load(role = "ADMIN") {
  let args: any;
  const db = {
    user: {
      findFirst: async (a: any) => {
        args = a;
        return {
          id: "t-1", fullName: "Synthetic Teacher", staffDocuments: [], staffTimelineEvents: [],
          ledClasses: [{ id: "c-1", name: "Grade 5", section: "A", _count: { students: 20, subjects: 6 } }],
          taughtSubjects: [{ id: "s-1", name: "Maths", totalMarks: 100, class: { id: "c-1", name: "Grade 5", section: "A" } }],
        };
      },
    },
  };
  const mod = { exports: {} as any };
  new Function("module", "exports", "require", code)(mod, mod.exports, (id: string) => {
    if (id === "@/lib/db/prisma") return { prisma: db };
    if (id === "@/lib/auth/policy") return { campusScope: (u: any) => ({ schoolId: u.schoolId, campusId: u.campusId }) };
    if (id === "@/lib/audit-events") return { writeAuditEvent: async () => {} };
    if (id === "@/lib/api/scope") return {
      ApiError,
      requireAuthUser: async () => ({ userId: "admin-1", role, schoolId: "school-a", campusId: "campus-a" }),
      canManageCampusOps: (u: any) => u.role === "ADMIN",
      assertPermission: async () => {},
      errorResponse: (e: any) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
    };
    return require(id);
  });
  const get = () => mod.exports.GET({ nextUrl: new URL("http://qa.test/api/staff/profile?userId=t-1") });
  return { get, args: () => args };
}

test("profile includes led classes and taught subjects scoped to school and campus", async () => {
  const f = load();
  const res = await f.get();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.ledClasses[0].name, "Grade 5");
  assert.equal(body.data.taughtSubjects[0].name, "Maths");
  const select = f.args().select;
  assert.deepEqual(select.ledClasses.where, { schoolId: "school-a", campusId: "campus-a", archivedAt: null });
  assert.deepEqual(select.taughtSubjects.where, { schoolId: "school-a", campusId: "campus-a" });
  assert.deepEqual(f.args().where, { id: "t-1", schoolId: "school-a", campusId: "campus-a" });
});

test("denied role is blocked", async () => {
  const res = await load("TEACHER").get();
  assert.equal(res.status, 403);
});
