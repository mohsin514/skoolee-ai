import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1153: regulator attendance codes map onto the existing statuses; NONE keeps today's register.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = {
  owner: true,
  school: { id: "school-a", name: "QA-01", status: "ACTIVE", plan: "BASIC", dataRegion: "DEFAULT", attendanceRegulator: "NONE" } as Record<string, unknown> | null,
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
  state.school = { id: "school-a", name: "QA-01", status: "ACTIVE", plan: "BASIC", dataRegion: "DEFAULT", attendanceRegulator: "NONE" };
  state.updates = [];
  state.audits = [];
});


test("NONE keeps today's behaviour: no codes, no calendar, every day markable", async () => {
  const { regulatorView, regulatorCode, isRegulatorSchoolDay, DEFAULT_ATTENDANCE_REGULATOR } = await import("../../src/lib/attendance/regulator");
  assert.equal(DEFAULT_ATTENDANCE_REGULATOR, "NONE");
  assert.equal(regulatorView("NONE", new Date("2026-11-07T00:00:00Z")), null);
  assert.equal(regulatorView(null, new Date("2026-11-07T00:00:00Z")), null);
  assert.equal(regulatorCode(undefined, "ABSENT"), null);
  assert.equal(isRegulatorSchoolDay("NONE", new Date("2026-11-07T00:00:00Z")), true);
});

test("every regulator set maps all six register statuses to distinct codes", async () => {
  const { REGULATOR_SETS, ATTENDANCE_REGULATORS } = await import("../../src/lib/attendance/regulator");
  const { ATTENDANCE_STATUSES } = await import("../../src/lib/attendance");
  for (const regulator of ATTENDANCE_REGULATORS.filter(r => r !== "NONE")) {
    const codes = REGULATOR_SETS[regulator].codes!;
    assert.deepEqual(Object.keys(codes).sort(), [...ATTENDANCE_STATUSES].sort(), regulator);
    assert.equal(new Set(Object.values(codes).map(c => c.code)).size, ATTENDANCE_STATUSES.length, regulator);
  }
});

test("KHDA codes round-trip and the reverse lookup ignores case", async () => {
  const { regulatorCode, statusForRegulatorCode } = await import("../../src/lib/attendance/regulator");
  assert.equal(regulatorCode("KHDA", "ABSENT"), "UA");
  assert.equal(regulatorCode("KHDA", "EXCUSED"), "AA");
  assert.equal(statusForRegulatorCode("KHDA", " ua "), "ABSENT");
  assert.equal(statusForRegulatorCode("KHDA", "ZZ"), null);
});

test("calendars: Saturday is a weekend for KHDA, Friday only for SPEA", async () => {
  const { isRegulatorSchoolDay, regulatorView } = await import("../../src/lib/attendance/regulator");
  const friday = new Date("2026-11-06T00:00:00Z"), saturday = new Date("2026-11-07T00:00:00Z"), monday = new Date("2026-11-09T00:00:00Z");
  assert.equal(isRegulatorSchoolDay("KHDA", saturday), false);
  assert.equal(isRegulatorSchoolDay("KHDA", friday), true);
  assert.equal(isRegulatorSchoolDay("SPEA", friday), false);
  assert.equal(isRegulatorSchoolDay("MOE", monday), true);
  const view = regulatorView("ADEK", monday)!;
  assert.equal(view.schoolDay, true);
  assert.equal(view.confirmed, false);
  assert.equal(view.codes.PRESENT, "P");
});

test("parseAttendanceRegulator normalises case and rejects unknown regulators", async () => {
  const { parseAttendanceRegulator } = await import("../../src/lib/attendance/regulator");
  assert.equal(parseAttendanceRegulator(" khda "), "KHDA");
  assert.throws(() => parseAttendanceRegulator("OFSTED"), /attendanceRegulator must be one of/);
});

test("the platform owner sets a school's regulator and the change is audited", async () => {
  const { PATCH } = await load();
  const res = await PATCH(patch({ attendanceRegulator: "khda" }), params);
  assert.equal(res.status, 200);
  assert.deepEqual(state.updates[0], { where: { id: "school-a" }, data: { attendanceRegulator: "KHDA" } });
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "attendance_regulator_changed");
  assert.equal((state.audits[0].oldValues as Record<string, unknown>).attendanceRegulator, "NONE");
  assert.equal((state.audits[0].newValues as Record<string, unknown>).attendanceRegulator, "KHDA");
});

test("an unknown regulator is refused with 400; non-owners get 403", async () => {
  const { PATCH } = await load();
  assert.equal((await PATCH(patch({ attendanceRegulator: "OFSTED" }), params)).status, 400);
  state.owner = false;
  assert.equal((await PATCH(patch({ attendanceRegulator: "KHDA" }), params)).status, 403);
  assert.equal(state.updates.length, 0);
});
