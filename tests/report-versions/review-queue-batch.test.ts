import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";

// SKAI-1961: GET /api/reports refreshes versions on view without one exam-wide write transaction.
// An unchanged exam is read with no writes and a fixed number of batched queries.
type Where = Record<string, unknown>;
type Card = { id: string; schoolId: string; campusId: string; currentVersionId: string | null; publishedVersionId: string | null; remarksEn: string };
type Version = { id: string; schoolId: string; reportCardId: string; number: number; contentHash: string; blockers: string[]; approvedAt: Date | null; approvedBy: string | null; publishedAt: Date | null; snapshot: unknown; documentBytes: Buffer | null; predecessorId: string | null; correctionReason: string | null };
const cards: Card[] = [];
const versions: Version[] = [];
const comms: Array<{ schoolId: string; relatedId: string; templateKey: string; channel: string; status: string; metadata: unknown }> = [];
const users = [{ id: "u-qa-01", schoolId: "qa-01", fullName: "Synthetic principal one" }, { id: "u-qa-02", schoolId: "qa-02", fullName: "Synthetic principal two" }];
let calls: string[] = [];
let transactions = 0;
let creates = 0;
let isolation: unknown[] = [];
let locks: string[] = [];
let failNext = 0;
let batches: Array<{ sql: string; values: unknown[] }> = [];

// Two schools, two campuses each, five cards per campus.
for (const school of ["qa-01", "qa-02"])
  for (const campus of ["c1", "c2"])
    for (let n = 0; n < 5; n++)
      cards.push({ id: `card-${school}-${campus}-${n}`, schoolId: school, campusId: `${school}-${campus}`, currentVersionId: null, publishedVersionId: null, remarksEn: "Good work" });

const inList = (value: unknown, cond: unknown) => (typeof cond === "object" && cond && "in" in cond ? (cond as { in: unknown[] }).in.includes(value) : value === cond);
// The real Prisma guard scopes single-row reads to the tenant in context; the mock does the same.
const tenant = () => (globalThis as { __skooleeTenantStorage?: AsyncLocalStorage<{ schoolId: string }> }).__skooleeTenantStorage?.getStore()?.schoolId;
const pick = (row: Record<string, unknown>, select?: Record<string, unknown>, omit?: Record<string, unknown>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : Object.fromEntries(Object.entries(row).filter(([k]) => !omit?.[k]));
const versionMatches = (v: Version, w: Where) =>
  (!("id" in w) || inList(v.id, w.id)) && (!("reportCardId" in w) || inList(v.reportCardId, w.reportCardId)) && (!("schoolId" in w) || v.schoolId === w.schoolId) && (!("approvedAt" in w) || v.approvedAt !== null) && (!("number" in w) || v.number < (w.number as { lt: number }).lt);

const client = {
  // The first-view statement (createFirstVersions): insert version 1 for each listed card of the bound school that
  // still has no current version and no version 1, and link it, all in one statement.
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (!sql.includes("INSERT INTO report_versions")) return 1;
    batches.push({ sql, values });
    const [json, changed, schoolId] = values as [string, string, string];
    let linked = 0;
    for (const row of JSON.parse(json) as Array<{ id: string; card: string; hash: string; language: string; identity: string; snapshot: unknown; blockers: string[] }>) {
      const card = cards.find((c) => c.id === row.card && c.schoolId === schoolId && c.currentVersionId === null);
      if (!card || versions.some((v) => v.reportCardId === card.id && v.number === 1)) continue;
      versions.push({ id: row.id, schoolId: card.schoolId, reportCardId: card.id, number: 1, contentHash: row.hash, blockers: row.blockers, approvedAt: null, approvedBy: null, publishedAt: null, snapshot: row.snapshot, documentBytes: null, predecessorId: card.publishedVersionId, correctionReason: null, changedSections: JSON.parse(changed), language: row.language, documentIdentity: row.identity } as Version);
      card.currentVersionId = row.id;
      linked++;
    }
    return linked;
  },
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { locks.push(`${strings.join("?")}|${values.join(",")}`); return [{ id: values[0] }]; },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>, options?: { isolationLevel?: string }) => {
    transactions++;
    isolation.push(options?.isolationLevel);
    if (failNext > 0) { failNext--; throw Object.assign(new Error("write conflict"), { code: "P2034" }); }
    return fn(client);
  },
  reportCard: {
    findMany: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => {
      calls.push("reportCard.findMany");
      return cards.filter((c) => inList(c.id, where.id) && c.schoolId === where.schoolId && (!("currentVersionId" in where) || c.currentVersionId !== null)).map((c) => pick(c, select));
    },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      calls.push("reportCard.findUniqueOrThrow");
      const c = cards.find((x) => x.id === where.id && x.schoolId === tenant());
      if (!c) throw new Error("not found");
      return { ...c };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Card> }) => { calls.push("reportCard.update"); const c = cards.find((x) => x.id === where.id)!; Object.assign(c, data); return c; },
  },
  reportVersion: {
    findMany: async ({ where, select, omit, orderBy }: { where: Where; select?: Record<string, unknown>; omit?: Record<string, unknown>; orderBy?: unknown }) => {
      calls.push("reportVersion.findMany");
      const rows = versions.filter((v) => versionMatches(v, where));
      if (orderBy) rows.sort((a, b) => a.reportCardId.localeCompare(b.reportCardId) || b.number - a.number);
      return rows.map((v) => pick(v, select, omit));
    },
    findUnique: async ({ where }: { where: { id: string } }) => { calls.push("reportVersion.findUnique"); return versions.find((v) => v.id === where.id) ?? null; },
    findFirst: async ({ where }: { where: Where }) => { calls.push("reportVersion.findFirst"); return versions.filter((v) => versionMatches(v, where)).sort((a, b) => b.number - a.number)[0] ?? null; },
    create: async ({ data }: { data: Omit<Version, "id" | "approvedAt" | "approvedBy" | "publishedAt" | "documentBytes" | "correctionReason"> }) => {
      calls.push("reportVersion.create");
      creates++;
      const v: Version = { ...data, id: `v-${data.reportCardId}-${data.number}`, approvedAt: null, approvedBy: null, publishedAt: null, documentBytes: null, correctionReason: null };
      versions.push(v);
      return v;
    },
  },
  subject: { findMany: async () => { calls.push("subject.findMany"); return [{ id: "maths", name: "Maths" }]; } },
  exam: { findUniqueOrThrow: async () => { calls.push("exam.findUniqueOrThrow"); return { status: "LOCKED", isLocked: true }; } },
  user: {
    findMany: async ({ where }: { where: Where }) => { calls.push("user.findMany"); return users.filter((u) => inList(u.id, where.id) && u.schoolId === where.schoolId); },
  },
  parentCommunication: {
    findMany: async ({ where }: { where: Where }) => {
      calls.push("parentCommunication.findMany");
      return comms.filter((c) => inList(c.relatedId, where.relatedId) && c.schoolId === where.schoolId && c.templateKey === where.templateKey);
    },
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/academic/report-cards", {
  namedExports: {
    isLockedStatus: (status: string) => ["LOCKED", "PUBLISHED", "PRINCIPAL_REVIEWED"].includes(status),
    getLiveReportCardPayload: async (id: string) => {
      calls.push("payload");
      const c = cards.find((x) => x.id === id && x.schoolId === tenant());
      if (!c) throw new Error("Report card not found");
      return {
        locale: {}, weightConfig: null, subjectDistribution: [], overall: null, uaeTemplate: null,
        marks: [{ subjectId: "maths", subject: "Maths", obtained: 40, total: 50, isAbsent: false, isExempt: false, grade: "B" }],
        reportCard: { id, schoolId: c.schoolId, campusId: c.campusId, studentId: `s-${id}`, examId: "exam", exam: { classId: "class", subjectId: null, title: "Term 1" }, reportLanguage: "en", remarksEn: c.remarksEn, remarksAr: null, remarksUr: null, campus: { name: c.campusId }, student: { id: `s-${id}`, fullName: "Synthetic pupil", rollNo: "1", class: { name: "5" } }, generatedAt: new Date() },
      };
    },
  },
});

const reviewQueue = async (cardIds: string[]) => (await import("../../src/lib/academic/report-versions")).reviewQueue(cardIds);
const as = async <T>(schoolId: string, fn: () => Promise<T>) =>
  (await import("../../src/lib/db/tenant-context")).runWithTenantContext({ schoolId, role: "PRINCIPAL", userId: `u-${schoolId}` }, fn);
const ids = (school: string) => cards.filter((c) => c.schoolId === school).map((c) => c.id);
const reset = () => { calls = []; transactions = 0; creates = 0; isolation = []; locks = []; failNext = 0; batches = []; };

test("the first view creates every missing version in one statement, never one transaction per card", async () => {
  reset();
  const rows = await as("qa-01", () => reviewQueue(ids("qa-01")));
  assert.equal(rows.length, 10);
  assert.equal(creates, 0, "no per-card create");
  assert.equal(batches.length, 1, "one insert-and-link statement for the whole exam");
  assert.equal(transactions, 1);
  // Read committed: an overlapping first view's rows are skipped on the unique key instead of aborting the batch.
  assert.deepEqual(isolation, ["ReadCommitted"]);
  assert.equal(locks.length, 0, "no per-card row lock");
  const [{ sql, values }] = batches;
  assert.match(sql, /ON CONFLICT \(report_card_id, number\) DO NOTHING/);
  assert.equal((sql.match(/current_version_id IS NULL/g) ?? []).length, 2, "insert and link only cards still without a version");
  assert.equal((sql.match(/rc\.school_id = \?/g) ?? []).length, 2);
  assert.deepEqual(values.slice(2), ["qa-01", "qa-01"], "scoped to the school in context");
  assert.deepEqual((JSON.parse(values[0] as string) as Array<{ card: string }>).map((r) => r.card), [...ids("qa-01")].sort(), "id order, so overlapping batches never deadlock");
  assert.deepEqual(rows.map((r) => r.reportCardId), ids("qa-01"), "keeps the caller's order");
  for (const r of rows) {
    assert.ok(!("documentBytes" in r));
    assert.equal(r.number, 1);
    assert.equal(r.approvedAt, null);
    assert.deepEqual(r.changedSections, ["Marks", "Grading rules and weighted results", "Remarks", "Language"], "what refreshVersion records with no prior approval");
    assert.deepEqual(r.blockers, []);
    assert.equal(cards.find((c) => c.id === r.reportCardId)!.currentVersionId, r.id);
  }
});

test("a second view with unchanged sources writes nothing and batches its lookups", async () => {
  reset();
  const rows = await as("qa-01", () => reviewQueue(ids("qa-01")));
  assert.equal(rows.length, 10);
  assert.equal(creates, 0);
  assert.equal(transactions, 0, "no write transaction when nothing changed");
  assert.ok(!calls.includes("reportCard.update"));
  const batched = calls.filter((c) => !["payload", "subject.findMany", "exam.findUniqueOrThrow"].includes(c));
  assert.deepEqual(batched.sort(), ["parentCommunication.findMany", "reportCard.findMany", "reportVersion.findMany", "reportVersion.findMany"].sort());
});

test("a changed remark refreshes only that card and clears its approval, with history and reviewer batched", async () => {
  const [first] = ids("qa-01");
  const before = await as("qa-01", () => reviewQueue([first]));
  // The principal approved version 1 (the approval path itself is covered by version.test.ts).
  Object.assign(versions.find((v) => v.id === before[0].id)!, { approvedAt: new Date(), approvedBy: "u-qa-01" });
  cards.find((c) => c.id === first)!.remarksEn = "Excellent progress";
  reset();
  const rows = await as("qa-01", () => reviewQueue(ids("qa-01")));
  assert.equal(creates, 1);
  assert.equal(transactions, 1);
  const changed = rows[0];
  assert.equal(changed.number, 2);
  assert.equal(changed.approvedAt, null);
  assert.equal(changed.reviewerName, "Synthetic principal one", "the prior approval's reviewer");
  assert.deepEqual((changed as unknown as { history: Array<{ number: number }> }).history.map((h) => h.number), [1]);
  assert.ok(changed.priorSnapshot);
  assert.equal(cards.find((c) => c.id === first)!.currentVersionId, changed.id);
});

test("a refresh that loses a race to another view of the same card retries and returns the stored version", async () => {
  const [, , third] = ids("qa-01");
  cards.find((c) => c.id === third)!.remarksEn = "Steady effort";
  reset();
  failNext = 2;
  const [row] = await as("qa-01", () => reviewQueue([third]));
  assert.equal(transactions, 3, "two conflicts, then the third attempt");
  assert.equal(creates, 1);
  assert.equal(row.number, 2);
  assert.equal(cards.find((c) => c.id === third)!.currentVersionId, row.id);
  reset();
  cards.find((c) => c.id === third)!.remarksEn = "Steady effort, well done";
  failNext = 3;
  await assert.rejects(as("qa-01", () => reviewQueue([third])), (error: Error & { status?: number }) => error.status === 409, "a lasting conflict is still a 409, never a 500");
  cards.find((c) => c.id === third)!.remarksEn = "Steady effort";
});

test("two simultaneous views of one changed card share a single refresh", async () => {
  const [, , , fourth] = ids("qa-01");
  cards.find((c) => c.id === fourth)!.remarksEn = "Reads widely";
  reset();
  const [a, b] = await Promise.all([as("qa-01", () => reviewQueue([fourth])), as("qa-01", () => reviewQueue([fourth]))]);
  assert.equal(creates, 1);
  assert.equal(transactions, 1, "the second view waits for the first refresh, not for the row lock");
  assert.equal(a[0].id, b[0].id);
  assert.equal(cards.find((c) => c.id === fourth)!.currentVersionId, a[0].id);
  cards.find((c) => c.id === fourth)!.remarksEn = "Good work";
});

test("delivery rows match the published version only", async () => {
  const [, second] = ids("qa-01");
  const card = cards.find((c) => c.id === second)!;
  card.publishedVersionId = card.currentVersionId;
  comms.push({ schoolId: "qa-01", relatedId: second, templateKey: "REPORT_CARD_PUBLISHED", channel: "EMAIL", status: "SENT", metadata: { reportVersionId: card.currentVersionId } });
  comms.push({ schoolId: "qa-01", relatedId: second, templateKey: "REPORT_CARD_PUBLISHED", channel: "WHATSAPP", status: "SENT", metadata: { reportVersionId: "older-version" } });
  comms.push({ schoolId: "qa-02", relatedId: second, templateKey: "REPORT_CARD_PUBLISHED", channel: "SMS", status: "SENT", metadata: { reportVersionId: card.currentVersionId } });
  const [row] = await as("qa-01", () => reviewQueue([second]));
  assert.deepEqual((row as unknown as { delivery: unknown[] }).delivery, [{ channel: "EMAIL", status: "SENT" }]);
  assert.equal(row.publishedVersionId, card.currentVersionId);
});

test("a first-view batch that a deadlock rolls back falls back to the per-card refresh", async () => {
  const campusOne = ids("qa-02").filter((id) => id.includes("-c1-"));
  reset();
  failNext = 1;
  const rows = await as("qa-02", () => reviewQueue(campusOne));
  assert.equal(batches.length, 0, "the rolled-back statement linked nothing");
  assert.equal(creates, 5);
  assert.deepEqual(isolation, ["ReadCommitted", ...campusOne.map(() => "RepeatableRead")]);
  assert.deepEqual(rows.map((r) => r.number), [1, 1, 1, 1, 1]);
  for (const r of rows) assert.equal(cards.find((c) => c.id === r.reportCardId)!.currentVersionId, r.id);
});

test("another school's cards never load under QA-01's scope, across both campuses", async () => {
  await assert.rejects(as("qa-01", () => reviewQueue([ids("qa-01")[0], ids("qa-02")[0]])));
  reset();
  const qa02 = await as("qa-02", () => reviewQueue(ids("qa-02")));
  assert.equal(qa02.length, 10);
  assert.deepEqual(batches.map((b) => b.values.slice(2)), [["qa-02", "qa-02"]], "the second campus's first view, scoped to QA-02");
  assert.ok(qa02.every((r) => r.schoolId === "qa-02"));
  assert.deepEqual([...new Set(cards.filter((c) => c.schoolId === "qa-02").map((c) => c.campusId))], ["qa-02-c1", "qa-02-c2"]);
  assert.ok(versions.filter((v) => v.schoolId === "qa-01").every((v) => v.reportCardId.startsWith("card-qa-01")));
});

test("no tenant context fails closed", async () => {
  reset();
  await assert.rejects(reviewQueue(["card-qa-01-c1-0"]));
  assert.equal(calls.length, 0);
});

test("the reports route keeps its role gates in front of the review queue", () => {
  const route = readFileSync(new URL("../../src/app/api/reports/route.ts", import.meta.url), "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.ok(get.indexOf('assertModuleRead(user, "reports")') < get.indexOf("reviewQueue("));
  assert.ok(get.indexOf('user.role === "TEACHER" && !teachesExamClass') < get.indexOf("reviewQueue("));
});
