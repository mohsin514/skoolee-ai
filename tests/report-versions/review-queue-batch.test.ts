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
  $executeRaw: async () => 1,
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => { transactions++; return fn(client); },
  reportCard: {
    findMany: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => {
      calls.push("reportCard.findMany");
      return cards.filter((c) => inList(c.id, where.id) && c.schoolId === where.schoolId).map((c) => pick(c, select));
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
const reset = () => { calls = []; transactions = 0; creates = 0; };

test("the first view creates each missing version in its own short transaction", async () => {
  reset();
  const rows = await as("qa-01", () => reviewQueue(ids("qa-01")));
  assert.equal(rows.length, 10);
  assert.equal(creates, 10);
  assert.equal(transactions, 10, "one transaction per card, never one for the whole exam");
  assert.deepEqual(rows.map((r) => r.reportCardId), ids("qa-01"), "keeps the caller's order");
  for (const r of rows) assert.ok(!("documentBytes" in r));
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

test("another school's cards never load under QA-01's scope, across both campuses", async () => {
  await assert.rejects(as("qa-01", () => reviewQueue([ids("qa-01")[0], ids("qa-02")[0]])));
  reset();
  const qa02 = await as("qa-02", () => reviewQueue(ids("qa-02")));
  assert.equal(qa02.length, 10);
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
