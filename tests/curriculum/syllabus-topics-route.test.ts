import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Topic = { id: string; subjectId: string; title: string; description: string | null; order: number };
let user = { userId: "u-a", schoolId: "school-a", campusId: "campus-a", role: "ADMIN" };
let manager = true;
let topics: Topic[] = [];
const subjects = [
  { id: "subj-a", campusId: "campus-a", schoolId: "school-a" },
  { id: "subj-a2", campusId: "campus-a2", schoolId: "school-a" },
  { id: "subj-b", campusId: "campus-b", schoolId: "school-b" },
];

class ApiError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

const syllabusTopic = {
  findMany: async ({ where }: { where: { subjectId: string } }) => topics.filter((t) => t.subjectId === where.subjectId),
  findFirst: async ({ where }: { where: { id?: string; subjectId: string; title?: { equals: string } } }) =>
    topics.find((t) => t.subjectId === where.subjectId
      && (where.id === undefined || t.id === where.id)
      && (where.title === undefined || t.title.toLowerCase() === where.title.equals.toLowerCase())) ?? null,
  count: async ({ where }: { where: { subjectId: string } }) => topics.filter((t) => t.subjectId === where.subjectId).length,
  create: async ({ data }: { data: Omit<Topic, "id"> }) => { const t = { id: `t${topics.length + 1}`, ...data }; topics.push(t); return t; },
  update: async ({ where, data }: { where: { id: string }; data: Partial<Topic> }) => { const t = topics.find((x) => x.id === where.id)!; Object.assign(t, data); return t; },
  delete: async ({ where }: { where: { id: string } }) => { topics = topics.filter((t) => t.id !== where.id); },
};
const tx = { $executeRaw: async () => 1, syllabusTopic };

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      subject: {
        findFirst: async ({ where }: { where: { id: string; campus: { schoolId: string }; campusId?: string } }) =>
          subjects.find((s) => s.id === where.id && s.schoolId === where.campus.schoolId && (!where.campusId || s.campusId === where.campusId)) ?? null,
      },
      syllabusTopic,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    canManageOperations: () => manager,
    errorResponse: (error: unknown) => Response.json({ success: false }, { status: error instanceof ApiError ? error.status : 500 }),
    requireAuthUser: async () => user,
  },
});
mock.module("@/lib/api/validate", { namedExports: { parseBody: async (req: Request) => req.json() } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });

const route = () => import("../../src/app/api/subjects/[subjectId]/syllabus/route");
const ctx = (subjectId: string) => ({ params: Promise.resolve({ subjectId }) });
const json = (method: string, body: unknown) => new Request("http://x/api", { method, body: JSON.stringify(body) }) as never;
const reset = () => { user = { userId: "u-a", schoolId: "school-a", campusId: "campus-a", role: "ADMIN" }; manager = true; topics = []; };

test("SKAI-215 a repeated add replays the saved topic instead of duplicating it", async () => {
  reset();
  const { POST } = await route();
  assert.equal((await POST(json("POST", { title: "Fractions" }), ctx("subj-a"))).status, 201);
  const again = await POST(json("POST", { title: " fractions " }), ctx("subj-a"));
  assert.equal(again.status, 200);
  assert.equal(topics.length, 1);
});

test("SKAI-215 edits refuse a blank title or an invalid order", async () => {
  reset();
  const { POST, PATCH } = await route();
  await POST(json("POST", { title: "Algebra" }), ctx("subj-a"));
  assert.equal((await PATCH(json("PATCH", { id: "t1", title: "  " }), ctx("subj-a"))).status, 400);
  assert.equal((await PATCH(json("PATCH", { id: "t1", order: "abc" }), ctx("subj-a"))).status, 400);
  assert.equal((await POST(json("POST", { title: "Geometry", order: -1 }), ctx("subj-a"))).status, 400);
  assert.equal(topics[0].title, "Algebra");
});

test("SKAI-215 another school or campus cannot read or change topics", async () => {
  reset();
  const { GET, POST } = await route();
  assert.equal((await GET(new Request("http://x/api") as never, ctx("subj-b"))).status, 404);
  assert.equal((await POST(json("POST", { title: "X" }), ctx("subj-b"))).status, 404);
  assert.equal((await POST(json("POST", { title: "X" }), ctx("subj-a2"))).status, 404);
  assert.equal(topics.length, 0);
});

test("SKAI-215 roles without operations access are refused", async () => {
  reset(); manager = false; user = { ...user, role: "PARENT" };
  const { POST, DELETE } = await route();
  assert.equal((await POST(json("POST", { title: "X" }), ctx("subj-a"))).status, 403);
  assert.equal((await DELETE(new Request("http://x/api?id=t1", { method: "DELETE" }) as never, ctx("subj-a"))).status, 403);
});
