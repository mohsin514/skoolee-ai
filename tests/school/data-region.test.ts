import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1143: a school's data region is validated, written only by the platform owner, and audited.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = {
  owner: true,
  school: { id: "school-a", name: "QA-01", status: "ACTIVE", plan: "BASIC", dataRegion: "DEFAULT" } as Record<string, unknown> | null,
  updates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
  audits: [] as Array<Record<string, unknown>>,
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requirePlatformOwner: async () => { if (!state.owner) throw new ApiError("Forbidden", 403); return { userId: "owner-1" }; },
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      school: {
        findUnique: async () => state.school,
        update: async (args: { where: unknown; data: Record<string, unknown> }) => { state.updates.push(args); return {}; },
      },
    },
  },
});
mock.module(src("lib/audit.ts"), { namedExports: { logSuperAdminAction: async (entry: Record<string, unknown>) => { state.audits.push(entry); } } });

const patch = (body: unknown) => new Request("http://local/api/owner/schools/school-a", { method: "PATCH", body: JSON.stringify(body) }) as never;
const params = { params: Promise.resolve({ id: "school-a" }) };
const load = () => import("../../src/app/api/owner/schools/[id]/route");

beforeEach(() => {
  state.owner = true;
  state.school = { id: "school-a", name: "QA-01", status: "ACTIVE", plan: "BASIC", dataRegion: "DEFAULT" };
  state.updates = [];
  state.audits = [];
});

test("parseDataRegion normalises case and rejects unknown regions", async () => {
  const { parseDataRegion, DATA_REGIONS } = await import("../../src/lib/school/data-region");
  assert.deepEqual([...DATA_REGIONS], ["DEFAULT", "UAE", "KSA"]);
  assert.equal(parseDataRegion(" ksa "), "KSA");
  assert.throws(() => parseDataRegion("eu-west-1"), /dataRegion must be one of/);
  assert.throws(() => parseDataRegion(42), /dataRegion must be one of/);
});

test("the platform owner sets a school's region and the change is audited", async () => {
  const { PATCH } = await load();
  const res = await PATCH(patch({ dataRegion: "uae" }), params);
  assert.equal(res.status, 200);
  assert.deepEqual(state.updates[0], { where: { id: "school-a" }, data: { dataRegion: "UAE" } });
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "data_region_changed");
  assert.deepEqual((state.audits[0].oldValues as Record<string, unknown>).dataRegion, "DEFAULT");
  assert.deepEqual((state.audits[0].newValues as Record<string, unknown>).dataRegion, "UAE");
});

test("an unknown region is refused with 400 and writes nothing", async () => {
  const { PATCH } = await load();
  const res = await PATCH(patch({ dataRegion: "mars" }), params);
  assert.equal(res.status, 400);
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
});

test("saving the same region writes no audit entry", async () => {
  const { PATCH } = await load();
  const res = await PATCH(patch({ dataRegion: "DEFAULT" }), params);
  assert.equal(res.status, 200);
  assert.equal(state.audits.length, 0);
});

test("anyone but the platform owner is refused", async () => {
  state.owner = false;
  const { PATCH } = await load();
  const res = await PATCH(patch({ dataRegion: "KSA" }), params);
  assert.equal(res.status, 403);
  assert.equal(state.updates.length, 0);
});
