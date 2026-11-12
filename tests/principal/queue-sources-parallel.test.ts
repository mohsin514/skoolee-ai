/**
 * SKAI-1829: the action-queue source readers run concurrently, so a queue load (and the sidebar badge) costs the
 * slowest source instead of the sum of ~20 round trips. Pins that the readers overlap, that items and failed sources
 * still come out in declaration order whatever order the reads finish in, and that every read keeps the caller's
 * school and campus scope (two schools, two campuses) while a role outside the queue is refused.
 *
 * Runs without a database: an in-memory stand-in is injected through `globalThis.prisma` before the module under test is
 * imported, as in tests/principal/queue-seats.test.ts.
 */
import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import type { AuthUser } from "../../src/lib/auth";

type Args = { where?: Record<string, any>; [key: string]: unknown } | undefined;

const NOW = Date.now();
const day = (offset: number) => new Date(NOW + offset * 86_400_000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const db = { failing: new Set<string>(), inFlight: 0, maxInFlight: 0, reads: [] as Array<{ model: string; where: Record<string, any> }> };

// Sources declared early answer slowest, so a concurrent run finishes them last.
const DELAY: Record<string, number> = { class: 60, leaveRequest: 55, reportVersion: 50, parentCommunication: 45, complaint: 40, financialAdjustment: 35, correction: 30, interventionPlan: 25, schoolAiRecord: 20, examPaperSlot: 15, exam: 5 };

const SOURCES: Record<string, (where: Record<string, any>) => unknown> = {
  leaveRequest: (where) => [{ id: `leave-${where.campusId}`, fromDate: day(3), toDate: day(4), user: { fullName: "Synthetic Teacher", role: "TEACHER" }, leaveType: { name: "Casual" } }],
  reportVersion: () => [{ id: "version-1", reportCardId: "card-1", reportCard: { currentVersionId: "version-1", examId: "exam-1", exam: { title: "Synthetic Midterm" } } }],
  parentCommunication: () => [{ id: "message-1", channel: "SMS", recipientName: "Synthetic Guardian", templateKey: "fee_reminder", createdAt: day(-3) }],
  complaint: () => [{ id: "complaint-1", referenceCode: "CMP-1", type: "Safeguarding", confidential: false, ownerId: null, dueDate: null, date: day(-5), owner: null }],
  financialAdjustment: () => [{ id: "adjustment-1", kind: "REFUND", createdAt: day(-1), invoiceId: "invoice-1" }],
  correction: () => [{ id: "correction-pay", kind: "PAYMENT", requesterName: "Synthetic Accountant", requestedAt: day(-1) }],
  exam: () => [{ id: "exam-2", title: "Synthetic Final", reviewedAt: day(-1), class: { name: "Grade 5", section: "A" } }],
};

function model(name: string) {
  return new Proxy({}, {
    get(_target, operation) {
      if (typeof operation !== "string" || operation === "then") return undefined;
      return async (args: Args) => {
        const where = args?.where ?? {};
        db.reads.push({ model: name, where });
        db.inFlight += 1; db.maxInFlight = Math.max(db.maxInFlight, db.inFlight);
        try {
          await sleep(DELAY[name] ?? 1);
          if (db.failing.has(name)) throw new Error(`synthetic ${name} outage`);
          if (name === "school" && operation === "findUniqueOrThrow") return { timezone: "Asia/Karachi" };
          if (name === "user" && operation === "groupBy") return [{ role: "PRINCIPAL", _count: { _all: 1 } }, { role: "CAMPUS_ADMIN", _count: { _all: 1 } }];
          if (operation === "findMany") return SOURCES[name]?.(where) ?? [];
          if (operation === "groupBy") return [];
          if (operation === "count") return 0;
          if (operation === "findFirst" || operation === "findUnique") return null;
          throw new Error(`fake prisma: ${name}.${operation} is not supported`);
        } finally {
          db.inFlight -= 1;
        }
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
  console.error = () => undefined; // failed-source logging is asserted through `failed`
  queue = await import("../../src/lib/principal/queue");
});

beforeEach(() => {
  db.failing = new Set();
  db.inFlight = 0;
  db.maxInFlight = 0;
  db.reads = [];
});

const groupAdmin = (schoolId: string): AuthUser => ({ userId: `admin-${schoolId}`, schoolId, campusId: null, role: "SUPER_ADMIN", email: "group-admin@example.invalid", institutionKind: "GROUP" });
const DECLARED = ["ATTENDANCE_MISSING", "LEAVE_PENDING", "REPORT_APPROVAL", "DELIVERY_FAILED", "COMPLAINT", "ADJUSTMENT_APPROVAL", "CORRECTION_APPROVAL", "SUPPORT_CHECKIN", "SYLLABUS_APPROVAL", "PAPER_DUE", "PAPER_MODERATION", "PAPER_SEAL", "RESULT_RELEASE"];

test("SKAI-1829: source readers overlap instead of running one after another", async () => {
  const started = Date.now();
  const result = await queue.collectSources(groupAdmin("school-a"), "campus-a1");
  const elapsed = Date.now() - started;
  assert.ok(db.maxInFlight >= 8, `expected the source reads to overlap, saw at most ${db.maxInFlight} at once`);
  // Serial reads would sleep for well over the sum of the delays (~380ms); concurrent reads take about the slowest chain.
  assert.ok(elapsed < 300, `queue sources took ${elapsed}ms`);
  assert.equal(result.items.length, 7);
});

test("SKAI-1829: items and failed sources keep declaration order whatever order the reads finish in", async () => {
  db.failing = new Set(["leaveRequest", "complaint", "exam"]);
  const result = await queue.collectSources(groupAdmin("school-a"), "campus-a1");
  assert.deepEqual(result.failed, ["LEAVE_PENDING", "COMPLAINT", "RESULT_RELEASE"]);
  const order = result.items.map((item) => DECLARED.indexOf(item.type));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.deepEqual(result.items.map((item) => item.type), ["REPORT_APPROVAL", "DELIVERY_FAILED", "ADJUSTMENT_APPROVAL", "CORRECTION_APPROVAL"]);
});

test("SKAI-1829: every concurrent read keeps the caller's school and campus (two schools, two campuses)", async () => {
  for (const [schoolId, campusId, other] of [["school-a", "campus-a1", "school-b"], ["school-b", "campus-b2", "school-a"]] as const) {
    db.reads = [];
    const result = await queue.collectSources(groupAdmin(schoolId), campusId);
    assert.ok(result.items.some((item) => item.key === `LEAVE_PENDING:leave-${campusId}`), "the campus's own rows are read");
    const scoped = db.reads.filter((read) => "campusId" in read.where);
    assert.ok(scoped.length >= 9, "the campus-scoped source reads ran");
    for (const read of scoped) {
      assert.equal(read.where.schoolId, schoolId, `${read.model} keeps the school scope`);
      assert.equal(read.where.campusId, campusId, `${read.model} keeps the campus scope`);
    }
    for (const read of db.reads) assert.notEqual(read.where.schoolId, other, `${read.model} never reads ${other}`);
  }
});

test("SKAI-1829: a role outside the queue is still refused before any source is read", async () => {
  const teacher: AuthUser = { userId: "teacher-1", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER", email: "teacher@example.invalid", institutionKind: "GROUP" };
  await assert.rejects(() => queue.loadQueue(teacher, "campus-a1"), (error: { status?: number }) => error.status === 403);
  assert.equal(db.reads.length, 0);
});
