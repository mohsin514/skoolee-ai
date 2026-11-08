import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, mock, test } from "node:test";

// SKAI-1765: there is no persisted invoice-generation job, so the status endpoint never reports one as completed.
class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const state = { user: { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a" } };
mock.module("@/lib/api/scope", {
  namedExports: {
    requireAuthUser: async () => state.user,
    assertFeesRead: async (u: { role: string }) => { if (u.role === "STUDENT" || u.role === "PARENT" || u.role === "LIBRARIAN") throw new ApiError("Insufficient permissions: fees.view", 403); },
    errorResponse: (e: unknown) => Response.json({ error: (e as Error).message }, { status: e instanceof ApiError ? e.status : 500 }),
  },
});

const poll = async (jobId: string) => {
  const { GET } = await import("../../src/app/api/fees/generation-job/[jobId]/route");
  const res = await GET(new Request("http://local") as never, { params: Promise.resolve({ jobId }) });
  return { status: res.status, body: await res.json() };
};

beforeEach(() => { state.user = { userId: "acc-a", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a" }; });

test("a never-started month is not found instead of completed", async () => {
  const r = await poll("invoice-gen-2099-12");
  assert.equal(r.status, 404);
  assert.notEqual(r.body.status, "completed");
});

test("another school's month id reads the same as an unknown one", async () => {
  const mine = await poll("invoice-gen-2026-10");
  state.user = { userId: "acc-b", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b" };
  assert.deepEqual(await poll("invoice-gen-2026-10"), mine);
  assert.equal(mine.status, 404);
});

test("roles without fees read are still refused with 403", async () => {
  for (const role of ["STUDENT", "PARENT", "LIBRARIAN"]) {
    state.user = { ...state.user, role };
    assert.equal((await poll("invoice-gen-2026-10")).status, 403, role);
  }
});

test("generation reports its synchronous result without issuing a pseudo job id", () => {
  const source = readFileSync("src/app/api/fees/generate-invoices/route.ts", "utf8");
  assert.doesNotMatch(source, /jobId:/);
  assert.doesNotMatch(source, /invoice-gen-/);
  assert.match(source, /generated,\s*\n\s*errors,/);
});
