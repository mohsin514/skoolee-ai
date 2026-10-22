/**
 * role-ux §7.5 G39 — the action queue is sliced by seat, but QueueItemState is per campus, so "the source condition is
 * gone" must be decided from the whole campus. Regression for the seat-filtering settle bug: a principal's load used to
 * mark every complaint, failed delivery, office leave and payment correction the campus admin had assigned as resolved
 * (and the campus admin's load did the same to report approvals and teacher leave), filling history with false RESOLVED
 * events.
 *
 * Runs without a database: an in-memory stand-in is injected through `globalThis.prisma` before the module under test is
 * imported (src/lib/db/prisma.ts uses `globalThis.prisma ?? new PrismaClient()`).
 */
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

type Args = { where?: Record<string, any>; [key: string]: unknown } | undefined;

const SCHOOL = "school-queue";
const CAMPUS = "campus-queue";
const NOW = Date.now();
const day = (offset: number) => new Date(NOW + offset * 86_400_000);

type State = { id: string; schoolId: string; campusId: string; itemKey: string; title: string | null; resolvedAt: Date | null; assigneeId: string | null; acknowledgedAt: Date | null; snoozedUntil: Date | null; snoozeReason: string | null; version: number };

const db = {
  seats: new Set<string>(),
  failing: new Set<string>(),
  states: [] as State[],
  events: [] as Array<{ itemKey: string; kind: string }>,
  resolvedQueries: [] as Args[],
};

const SOURCES: Record<string, () => unknown> = {
  leaveRequest: () => [
    { id: "leave-teacher", fromDate: day(3), toDate: day(4), user: { fullName: "Synthetic Teacher", role: "TEACHER" }, leaveType: { name: "Casual" } },
    { id: "leave-office", fromDate: day(5), toDate: day(6), user: { fullName: "Synthetic Receptionist", role: "RECEPTIONIST" }, leaveType: { name: "Casual" } },
  ],
  reportVersion: () => [{ id: "version-1", reportCardId: "card-1", reportCard: { currentVersionId: "version-1", examId: "exam-1", exam: { title: "Synthetic Midterm" } } }],
  parentCommunication: () => [{ id: "message-1", channel: "SMS", recipientName: "Synthetic Guardian", templateKey: "fee_reminder", createdAt: day(-3) }],
  complaint: () => [{ id: "complaint-1", referenceCode: "CMP-1", type: "Safeguarding", confidential: true, ownerId: null, dueDate: null, date: day(-5), owner: null }],
  financialAdjustment: () => [{ id: "adjustment-1", kind: "REFUND", createdAt: day(-1), invoiceId: "invoice-1" }],
  correction: () => [
    { id: "correction-pay", kind: "PAYMENT", requesterName: "Synthetic Accountant", requestedAt: day(-1) },
    { id: "correction-mark", kind: "MARK", requesterName: "Synthetic Teacher", requestedAt: day(-1) },
  ],
  interventionPlan: () => [],
  class: () => [],
};

function model(name: string) {
  return new Proxy({}, {
    get(_target, operation) {
      if (typeof operation !== "string" || operation === "then") return undefined;
      return async (args: Args) => {
        if (db.failing.has(name)) throw new Error(`synthetic ${name} outage`);
        if (name === "school" && operation === "findUniqueOrThrow") return { timezone: "Asia/Karachi" };
        if (name === "user" && operation === "groupBy") return [...db.seats].map((role) => ({ role, _count: { _all: 1 } }));
        if (name === "queueItemState" && operation === "findMany") {
          const where = args?.where ?? {};
          if (!where.resolvedAt) return db.states.filter((state) => state.campusId === where.campusId);
          db.resolvedQueries.push(args);
          const prefixes: string[] = (where.OR ?? []).map((clause: { itemKey: { startsWith: string } }) => clause.itemKey.startsWith);
          return db.states.filter((state) => state.resolvedAt && prefixes.some((prefix) => state.itemKey.startsWith(prefix)))
            .map((state) => ({ itemKey: state.itemKey, title: state.title, resolvedAt: state.resolvedAt }));
        }
        if (name === "queueItemState" && operation === "updateMany") {
          const ids: string[] = args?.where?.id?.in ?? [];
          for (const state of db.states) if (ids.includes(state.id)) Object.assign(state, args?.data);
          return { count: ids.length };
        }
        if (name === "queueItemEvent" && operation === "createMany") {
          for (const row of (args?.data as Array<{ itemKey: string; kind: string }>)) db.events.push({ itemKey: row.itemKey, kind: row.kind });
          return { count: (args?.data as unknown[]).length };
        }
        // history(): resolve one LEAVE_PENDING / CORRECTION_APPROVAL record by id to find its seat family.
        if ((name === "leaveRequest" || name === "correction") && operation === "findFirst") {
          const rows = SOURCES[name]() as Array<{ id: string }>;
          return rows.find((row) => row.id === args?.where?.id) ?? null;
        }
        if (operation === "findMany") return SOURCES[name]?.() ?? [];
        if (operation === "groupBy") return [];
        if (operation === "count") return 0;
        if (operation === "findFirst" || operation === "findUnique") return null;
        throw new Error(`fake prisma: ${name}.${operation} is not supported`);
      };
    },
  });
}

const fakePrisma: Record<string, unknown> = new Proxy({}, {
  get(_target, property) {
    if (typeof property !== "string" || property === "then") return undefined;
    if (property === "$transaction") return async (work: unknown) => Array.isArray(work) ? Promise.all(work) : (work as (tx: unknown) => unknown)(fakePrisma);
    if (property.startsWith("$")) return async () => undefined;
    return model(property);
  },
});

let queue: typeof import("../../src/lib/principal/queue");

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" });
  (globalThis as { prisma?: unknown }).prisma = fakePrisma;
  console.error = () => undefined; // failed-source logging is asserted through `failedSources`
  queue = await import("../../src/lib/principal/queue");
});

beforeEach(() => {
  db.seats = new Set(["CAMPUS_ADMIN", "PRINCIPAL"]);
  db.failing = new Set();
  db.states = [];
  db.events = [];
  db.resolvedQueries = [];
});

const actor = (role: AuthUser["role"]): AuthUser => ({ userId: `user-${role.toLowerCase()}`, schoolId: SCHOOL, campusId: CAMPUS, role, email: `${role.toLowerCase()}@example.invalid`, institutionKind: "GROUP" });
const state = (itemKey: string, changes: Partial<State> = {}): State => ({
  id: `state-${itemKey}`, schoolId: SCHOOL, campusId: CAMPUS, itemKey, title: itemKey, resolvedAt: null, assigneeId: "user-someone", acknowledgedAt: null, snoozedUntil: null, snoozeReason: null, version: 1, ...changes,
});
const OPERATIONS_KEYS = ["COMPLAINT:complaint-1", "DELIVERY_FAILED:message-1", "ADJUSTMENT_APPROVAL:adjustment-1", "LEAVE_PENDING:leave-office", "CORRECTION_APPROVAL:correction-pay"];
const ACADEMIC_KEYS = ["REPORT_APPROVAL:exam-1", "LEAVE_PENDING:leave-teacher", "CORRECTION_APPROVAL:correction-mark"];

test("each seat reads only its own families (G39)", async () => {
  const principal = await queue.loadQueue(actor("PRINCIPAL"), CAMPUS);
  assert.deepEqual(principal.items.map((item) => item.key).sort(), [...ACADEMIC_KEYS].sort());
  const campus = await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  assert.deepEqual(campus.items.map((item) => item.key).sort(), [...OPERATIONS_KEYS].sort());
  assert.equal(campus.items.find((item) => item.type === "COMPLAINT")?.link, "/admin?view=front-desk&tab=complaints");
  // With no principal on the campus, the campus admin also holds the academic families.
  db.seats = new Set(["CAMPUS_ADMIN"]);
  const acting = await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  assert.deepEqual(acting.items.map((item) => item.key).sort(), [...OPERATIONS_KEYS, ...ACADEMIC_KEYS].sort());
});

test("a principal's load never settles the campus admin's items, and the reverse", async () => {
  db.states = [...OPERATIONS_KEYS, ...ACADEMIC_KEYS].map((key) => state(key));
  for (let round = 0; round < 3; round++) {
    await queue.loadQueue(actor("PRINCIPAL"), CAMPUS);
    await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  }
  assert.deepEqual(db.states.filter((row) => row.resolvedAt).map((row) => row.itemKey), [], "no live item is marked resolved");
  assert.deepEqual(db.events, [], "no false RESOLVED history");
});

test("an item whose source condition is gone is settled once, whichever seat loads first", async () => {
  db.states = [state("COMPLAINT:complaint-gone"), state("REPORT_APPROVAL:exam-gone"), state("COMPLAINT:complaint-1")];
  await queue.loadQueue(actor("PRINCIPAL"), CAMPUS);
  assert.deepEqual(db.states.filter((row) => row.resolvedAt).map((row) => row.itemKey).sort(), ["COMPLAINT:complaint-gone", "REPORT_APPROVAL:exam-gone"]);
  assert.deepEqual(db.events.map((event) => `${event.kind} ${event.itemKey}`).sort(), ["RESOLVED COMPLAINT:complaint-gone", "RESOLVED REPORT_APPROVAL:exam-gone"]);
  await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  assert.equal(db.events.length, 2, "settled once; the other seat's load adds nothing");
});

test("a failed source is never read as resolved, and only the seat that owns it is told", async () => {
  db.failing = new Set(["complaint"]);
  db.states = [state("COMPLAINT:complaint-1")];
  const principal = await queue.loadQueue(actor("PRINCIPAL"), CAMPUS);
  const campus = await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  assert.equal(db.states[0].resolvedAt, null);
  assert.deepEqual(principal.failedSources, [], "the principal never reads complaints");
  assert.deepEqual(campus.failedSources, ["COMPLAINT"]);
});

test("the resolved history follows the viewer's seat", async () => {
  db.states = [state("COMPLAINT:old-complaint", { resolvedAt: day(-1) }), state("REPORT_APPROVAL:old-exam", { resolvedAt: day(-1) }), state("LEAVE_PENDING:old-leave", { resolvedAt: day(-1) })];
  const principal = await queue.loadQueue(actor("PRINCIPAL"), CAMPUS);
  assert.deepEqual(principal.resolved.map((row) => row.key).sort(), ["LEAVE_PENDING:old-leave", "REPORT_APPROVAL:old-exam"]);
  const campus = await queue.loadQueue(actor("CAMPUS_ADMIN"), CAMPUS);
  assert.deepEqual(campus.resolved.map((row) => row.key).sort(), ["COMPLAINT:old-complaint", "LEAVE_PENDING:old-leave"]);
});

test("collectSources (the sidebar count) stays the viewer's slice", async () => {
  const principal = await queue.collectSources(actor("PRINCIPAL"), CAMPUS);
  assert.deepEqual(principal.items.map((item) => item.key).sort(), [...ACADEMIC_KEYS].sort());
  assert.equal(principal.items.some((item) => "family" in item), false, "the internal seat tag is not part of the item");
  const groupAdmin = await queue.collectSources({ ...actor("SUPER_ADMIN"), campusId: null }, CAMPUS);
  assert.equal(groupAdmin.items.length, OPERATIONS_KEYS.length + ACADEMIC_KEYS.length, "the group admin reads every family");
});

test("item history follows the viewer's seat: no complaint history for the principal, no academic history for the campus admin (G39)", async () => {
  const reads = async (user: AuthUser, key: string) => {
    try { await queue.history(user, CAMPUS, key); return 200; } catch (error) { return (error as { status?: number }).status ?? 500; }
  };
  for (const key of ACADEMIC_KEYS) {
    assert.equal(await reads(actor("PRINCIPAL"), key), 200, `principal reads ${key}`);
    assert.equal(await reads(actor("CAMPUS_ADMIN"), key), 403, `campus admin with a principal does not read ${key}`);
  }
  for (const key of OPERATIONS_KEYS) {
    assert.equal(await reads(actor("PRINCIPAL"), key), 403, `principal does not read ${key}`);
    assert.equal(await reads(actor("CAMPUS_ADMIN"), key), 200, `campus admin reads ${key}`);
  }
  // A record that no longer resolves is readable only by a viewer holding both families.
  assert.equal(await reads(actor("PRINCIPAL"), "LEAVE_PENDING:leave-gone"), 403);
  assert.equal(await reads(actor("CAMPUS_ADMIN"), "CORRECTION_APPROVAL:correction-gone"), 403);
  assert.equal(await reads({ ...actor("SUPER_ADMIN"), campusId: null }, "LEAVE_PENDING:leave-gone"), 200, "the group admin reads every family");
  // With no principal on the campus, the campus admin holds the academic families too.
  db.seats = new Set(["CAMPUS_ADMIN"]);
  for (const key of [...ACADEMIC_KEYS, ...OPERATIONS_KEYS, "LEAVE_PENDING:leave-gone"]) assert.equal(await reads(actor("CAMPUS_ADMIN"), key), 200, key);
  // Keys that are not queue items, and roles outside the queue, are refused.
  assert.equal(await reads(actor("CAMPUS_ADMIN"), "NOT_A_TYPE:x"), 404);
  assert.equal(await reads(actor("CAMPUS_ADMIN"), "COMPLAINT"), 404);
  assert.equal(await reads(actor("TEACHER"), "REPORT_APPROVAL:exam-1"), 403);
});

test("the published sorting rule names every ranked category, with AR and UR", async () => {
  const { arabicP1Ui, urduP1Ui } = await import("../../src/lib/locale/role-ux/p1-messages");
  assert.match(queue.SORTING_RULE, /record corrections to decide/);
  assert.ok(arabicP1Ui[queue.SORTING_RULE], "Arabic");
  assert.ok(urduP1Ui[queue.SORTING_RULE], "Urdu");
});
