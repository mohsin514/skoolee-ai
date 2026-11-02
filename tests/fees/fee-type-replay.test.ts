import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Row = { id: string; campusId: string; code: string; name: string; description: string | null };
let rows: Row[] = [];
let audits: string[] = [];
// Runs once, right after a read, to model a concurrent create committing in between.
let beforeCreate: (() => void) | null = null;

const uniqueError = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

const fakeTx = {
  feeType: {
    create: async ({ data }: { data: Omit<Row, "id"> }) => {
      if (rows.some((r) => r.campusId === data.campusId && r.code === data.code)) throw uniqueError();
      const row = { id: `ft-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    },
  },
};

const fakePrisma = {
  feeType: {
    findUnique: async ({ where }: { where: { campusId_code: { campusId: string; code: string } } }) => {
      const found = rows.find((r) => r.campusId === where.campusId_code.campusId && r.code === where.campusId_code.code) ?? null;
      // A concurrent identical create commits after this read and before our insert.
      if (beforeCreate) { const hook = beforeCreate; beforeCreate = null; hook(); }
      return found;
    },
  },
  $transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => {
    // Failed transactions leave no row behind, as in Postgres.
    const snapshot = rows.slice();
    try { return await fn(fakeTx); } catch (e) { rows = snapshot; throw e; }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async (_tx: unknown, _u: unknown, e: { recordId: string }) => { audits.push(e.recordId); } } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    resolveCampusId: async (_u: unknown, requested?: string | null) => requested || "campus-a",
  },
});

const loadCommand = () => import("@/lib/fees/fee-type-command");
const user = (campusId = "campus-a", schoolId = "school-a") => ({ userId: "acc-1", role: "ACCOUNTANT", schoolId, campusId }) as never;
const body = (over: Record<string, unknown> = {}) => ({ name: "Tuition", code: "TUITION", description: "Term fee", ...over });
const is409 = (e: { status?: number }) => e.status === 409;

test("first create stores the row and audits it once", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  const row = await createFeeType(user(), body());
  assert.equal(row.code, "TUITION");
  assert.equal(rows.length, 1);
  assert.deepEqual(audits, [row.id]);
});

test("an identical sequential retry replays the committed row without a second audit", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  const first = await createFeeType(user(), body());
  const again = await createFeeType(user(), body());
  assert.equal(again.id, first.id);
  assert.equal(rows.length, 1);
  assert.equal(audits.length, 1);
});

test("a concurrent identical create that loses the race replays the committed row, never P2002", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  beforeCreate = () => rows.push({ id: "ft-winner", campusId: "campus-a", code: "TUITION", name: "Tuition", description: "Term fee" });
  const row = await createFeeType(user(), body());
  assert.equal(row.id, "ft-winner");
  assert.equal(rows.length, 1);
  assert.deepEqual(audits, []);
});

test("a different payload with the same code gets a controlled 409 and no P2002", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  await createFeeType(user(), body());
  await assert.rejects(() => createFeeType(user(), body({ name: "Tuition Fee" })), is409);
  assert.equal(rows.length, 1);
});

test("a different payload that loses the race gets a controlled 409, not the raw error", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  beforeCreate = () => rows.push({ id: "ft-winner", campusId: "campus-a", code: "TUITION", name: "Other", description: null });
  await assert.rejects(() => createFeeType(user(), body()), (e: { status?: number; code?: string }) => is409(e) && e.code !== "P2002");
});

test("normalisation: lower case, padded and spaced codes and blank descriptions are the same request", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  const first = await createFeeType(user(), body({ code: "tuition", description: "Term fee" }));
  const again = await createFeeType(user(), body({ code: "  Tuition ", description: "  Term fee  " }));
  assert.equal(again.id, first.id);
  const noDesc = await createFeeType(user(), body({ code: "late fee", description: "" }));
  const noDescAgain = await createFeeType(user(), body({ code: "LATE_FEE", description: undefined }));
  assert.equal(noDesc.code, "LATE_FEE");
  assert.equal(noDescAgain.id, noDesc.id);
});

test("campus isolation: the same code on another campus is a separate fee type", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  const a = await createFeeType(user("campus-a"), body({ campusId: "campus-a" }));
  const b = await createFeeType(user("campus-b"), body({ campusId: "campus-b" }));
  assert.notEqual(a.id, b.id);
  assert.equal(rows.length, 2);
});

test("school isolation: a campus of another school cannot replay or conflict with this school's row", async () => {
  rows = []; audits = []; beforeCreate = null;
  const { createFeeType } = await loadCommand();
  await createFeeType(user("campus-a", "school-a"), body({ campusId: "campus-a" }));
  const other = await createFeeType(user("campus-z", "school-b"), body({ campusId: "campus-z", name: "Other school" }));
  assert.equal(other.campusId, "campus-z");
  assert.equal(rows.length, 2);
});
