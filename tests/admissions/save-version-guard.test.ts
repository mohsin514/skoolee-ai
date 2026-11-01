import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1389: a save from an older view is refused, and the write is conditional on the version read.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const state = {
  application: { id: "app-1", reference: "APP-0000ABCD", version: 3, channel: "STAFF", status: "DRAFT", campusId: "campus-a", schoolId: "school-a", formVersion: { definition: { fields: [], documents: [], consent: { en: "" } } }, resumeKeyHash: "h" } as Record<string, unknown>,
  writesMatching: 1,
  writes: [] as Array<Record<string, unknown>>,
};

const db = {
  admissionApplication: {
    findFirst: async () => ({ ...state.application }),
    findUniqueOrThrow: async () => ({ ...state.application, version: 4 }),
    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { state.writes.push(args); return { count: state.writesMatching }; },
  },
  admissionApplicationEvent: { create: async () => ({}) },
};

mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: db, sha256: undefined } });
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError, assertModuleRead: async () => undefined, assertPermission: async () => undefined, assertStaffRole: () => undefined } });
mock.module(src("lib/auth/institution.ts"), { namedExports: { isCampusOperator: () => false } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runUnscoped: async (_reason: string, fn: () => Promise<unknown>) => fn() } });
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_user: unknown, work: (client: unknown) => Promise<unknown>) => work(db) } });
mock.module(src("lib/billing/entitlements.ts"), { namedExports: { assertPlanCapacity: async () => undefined } });
mock.module(src("lib/notifications/actions.ts"), { namedExports: { resolveSourceActions: () => [] } });
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { deliverNotification: async () => undefined } });

const user = { userId: "staff-1", schoolId: "school-a", campusId: "campus-a", role: "RECEPTIONIST" } as never;

test("a staff save from a stale view is refused before any write", async () => {
  state.writes.length = 0;
  const { staffSaveAnswers } = await import(src("lib/admissions/service.ts"));
  await assert.rejects(staffSaveAnswers(user, "campus-a", { id: "app-1", version: 2, answers: {} }), (error: ApiError) => error.status === 409);
  assert.equal(state.writes.length, 0);
});

test("a staff save that loses the version race is refused", async () => {
  state.writes.length = 0;
  state.writesMatching = 0;
  const { staffSaveAnswers } = await import(src("lib/admissions/service.ts"));
  await assert.rejects(staffSaveAnswers(user, "campus-a", { id: "app-1", version: 3, answers: {} }), (error: ApiError) => error.status === 409);
  assert.deepEqual(state.writes[0].where, { id: "app-1", version: 3 });
  state.writesMatching = 1;
});
