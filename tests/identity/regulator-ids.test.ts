import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1149: the regulator field set (Emirates ID, nationality, eSIS / MOE ID) on student and staff records.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

// Synthetic numbers with valid Luhn check digits; not real cards.
const VALID = "784-1990-1234567-6";
const VALID_COMPACT = "784199012345676";

const state = {
  user: { userId: "admin-a", role: "SUPER_ADMIN", schoolId: "school-a", campusId: "campus-a" } as Record<string, unknown>,
  staffUpserts: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
  staffFound: true,
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    canManageCampusOps: (user: Record<string, unknown>) => ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"].includes(String(user.role)),
    assertPermission: async () => undefined,
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
mock.module(src("lib/auth/policy.ts"), { namedExports: { campusScope: (user: Record<string, unknown>) => ({ schoolId: user.schoolId }) } });
const tx = {
  staffProfile: { upsert: async (args: Record<string, unknown>) => { state.staffUpserts.push(args); return { id: "profile-1", contractType: null, basicSalary: 0 }; } },
  staffTimelineEvent: { createMany: async () => ({}) },
};
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      user: {
        findFirst: async (args: { where: Record<string, unknown> }) => state.staffFound
          ? { id: args.where.id, fullName: "QA Teacher", staffProfile: { id: "profile-1", emiratesId: null, nationality: null, regulatorId: null, basicSalary: 0 } }
          : null,
      },
      $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
    },
  },
});
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async (_tx: unknown, _user: unknown, entry: Record<string, unknown>) => { state.audits.push(entry); } } });

const patch = (body: unknown) => new Request("http://local/api/staff/profile", { method: "PATCH", body: JSON.stringify(body) }) as never;
const loadStaff = () => import("../../src/app/api/staff/profile/route");

beforeEach(() => {
  state.user = { userId: "admin-a", role: "SUPER_ADMIN", schoolId: "school-a", campusId: "campus-a" };
  state.staffUpserts = [];
  state.audits = [];
  state.staffFound = true;
});

test("Emirates ID is normalised to the printed form and checked", async () => {
  const { parseEmiratesId } = await import("../../src/lib/identity/regulator-ids");
  assert.equal(parseEmiratesId(VALID_COMPACT), VALID);
  assert.equal(parseEmiratesId(" 784 1990 1234567 6 "), VALID);
  assert.equal(parseEmiratesId(""), null);
  assert.equal(parseEmiratesId(null), null);
  assert.throws(() => parseEmiratesId("784-1990-1234567-1"), /check digit/);
  assert.throws(() => parseEmiratesId("123456789012345"), /15 digits starting with 784/);
  assert.throws(() => parseEmiratesId("784-ABCD"), /only digits/);
});

test("eSIS / MOE ID and nationality are optional and bounded", async () => {
  const { parseRegulatorId, parseNationality } = await import("../../src/lib/identity/regulator-ids");
  assert.equal(parseRegulatorId(" esis-00123 "), "ESIS-00123");
  assert.equal(parseRegulatorId(""), null);
  assert.throws(() => parseRegulatorId("has space"), /letters, digits and dashes/);
  assert.throws(() => parseRegulatorId("A".repeat(31)), /up to 30/);
  assert.equal(parseNationality(" Emirati "), "Emirati");
  assert.throws(() => parseNationality("x".repeat(61)), /60 characters/);
});

test("the audit view masks identifiers and lists only changed fields", async () => {
  const { regulatorAuditChange } = await import("../../src/lib/identity/regulator-ids");
  const change = regulatorAuditChange({ emiratesId: null, nationality: "Pakistani", regulatorId: "ESIS-1" }, { emiratesId: VALID, nationality: "Pakistani" });
  assert.deepEqual(change.fields, ["emiratesId"]);
  assert.deepEqual(change.from, { emiratesId: null });
  assert.deepEqual(change.to, { emiratesId: "•••• 5676" });
  assert.ok(!JSON.stringify(change).includes("1234567"));
});

test("an admin saves a staff member's regulator fields; the audit entry carries masked values only", async () => {
  const { PATCH } = await loadStaff();
  const res = await PATCH(patch({ userId: "teacher-a", emiratesId: VALID_COMPACT, nationality: "Emirati", regulatorId: "moe-778" }));
  assert.equal(res.status, 200);
  const update = state.staffUpserts[0].update as Record<string, unknown>;
  assert.equal(update.emiratesId, VALID);
  assert.equal(update.nationality, "Emirati");
  assert.equal(update.regulatorId, "MOE-778");
  const after = state.audits[0].after as Record<string, unknown>;
  assert.equal(after.emiratesIdFrom, null);
  assert.equal(after.emiratesIdTo, "•••• 5676");
  assert.equal(after.nationalityTo, "Emirati");
  assert.equal(after.regulatorIdTo, "•••• E778");
  assert.ok(!JSON.stringify(state.audits).includes("1234567"));
});

test("a malformed Emirates ID is refused with 400 and nothing is written", async () => {
  const { PATCH } = await loadStaff();
  const res = await PATCH(patch({ userId: "teacher-a", emiratesId: "784-1990-1234567-1" }));
  assert.equal(res.status, 400);
  assert.equal(state.staffUpserts.length, 0);
});

test("a staff member in another school is not found, and a teacher may not edit at all", async () => {
  const { PATCH } = await loadStaff();
  state.staffFound = false;
  assert.equal((await PATCH(patch({ userId: "teacher-b", emiratesId: VALID }))).status, 404);
  state.staffFound = true;
  state.user = { userId: "t1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  assert.equal((await PATCH(patch({ userId: "teacher-a", emiratesId: VALID }))).status, 403);
  assert.equal(state.staffUpserts.length, 0);
});
