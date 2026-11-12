import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1835: family/student portals read every released card in two school-scoped queries, never the PDF bytes.
type Where = Record<string, unknown>;
const calls: Array<{ model: string; where: Where; select?: Record<string, unknown> }> = [];

const snapshot = (n: number, school: string) => ({
  reportCard: { id: `card-${school}-${n}`, percentage: 50 + n, exam: { title: `Term ${n}`, term: `T${n % 3}`, academicYear: 2016 + Math.floor(n / 3) } },
  marks: [{ subject: "Maths", marksObtained: n }],
});
type Card = { id: string; schoolId: string; publishedVersionId: string | null; examStatus: string };
type Version = { id: string; schoolId: string; reportCardId: string; number: number; language: string; documentIdentity: string; snapshot: unknown; correctionReason: string | null; predecessorId: string | null; approvedAt: Date | null; publishedAt: Date | null; documentBytes: Buffer };
const cards: Card[] = [];
const versions: Version[] = [];
// QA-01 has 30 released cards (ten years of three terms); QA-02 has its own cards and versions.
for (const school of ["qa-01", "qa-02"]) {
  for (let n = 0; n < 30; n++) {
    const id = `card-${school}-${n}`;
    cards.push({ id, schoolId: school, publishedVersionId: `v-${id}-2`, examStatus: "PUBLISHED" });
    versions.push({ id: `v-${id}-1`, schoolId: school, reportCardId: id, number: 1, language: "en", documentIdentity: `doc-${id}-1`, snapshot: snapshot(n, school), correctionReason: null, predecessorId: null, approvedAt: new Date(), publishedAt: new Date(), documentBytes: Buffer.alloc(8) });
    versions.push({ id: `v-${id}-2`, schoolId: school, reportCardId: id, number: 2, language: n % 2 ? "ar" : "en", documentIdentity: `doc-${id}-2`, snapshot: snapshot(n, school), correctionReason: n % 5 ? null : "Typo in maths", predecessorId: n % 5 ? null : `v-${id}-1`, approvedAt: new Date(), publishedAt: new Date(), documentBytes: Buffer.alloc(8) });
  }
}
// Unreleased cases in QA-01.
cards.push({ id: "card-draft-exam", schoolId: "qa-01", publishedVersionId: "v-draft", examStatus: "MARKS_ENTRY" });
versions.push({ id: "v-draft", schoolId: "qa-01", reportCardId: "card-draft-exam", number: 1, language: "en", documentIdentity: "doc-draft", snapshot: snapshot(0, "qa-01"), correctionReason: null, predecessorId: null, approvedAt: new Date(), publishedAt: new Date(), documentBytes: Buffer.alloc(8) });
cards.push({ id: "card-unapproved", schoolId: "qa-01", publishedVersionId: "v-unapproved", examStatus: "PUBLISHED" });
versions.push({ id: "v-unapproved", schoolId: "qa-01", reportCardId: "card-unapproved", number: 1, language: "en", documentIdentity: "doc-unapproved", snapshot: snapshot(0, "qa-01"), correctionReason: null, predecessorId: null, approvedAt: null, publishedAt: null, documentBytes: Buffer.alloc(8) });

const inList = (value: unknown, cond: unknown) => (cond as { in: unknown[] }).in.includes(value);
const pick = (row: Record<string, unknown>, select?: Record<string, unknown>) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });
const cardMatches = (c: Card, w: Where) =>
  inList(c.id, w.id) && c.schoolId === w.schoolId && c.publishedVersionId !== null && c.examStatus === (w.exam as { status: string }).status;
const versionMatches = (v: Version, w: Where) =>
  inList(v.id, w.id) && inList(v.reportCardId, w.reportCardId) && v.schoolId === w.schoolId && v.approvedAt !== null && v.publishedAt !== null;

mock.module("@/lib/db/prisma", { namedExports: { prisma: {
  reportCard: {
    findMany: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => { calls.push({ model: "reportCard.findMany", where, select }); return cards.filter((c) => cardMatches(c, where)).map((c) => pick(c, select)); },
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
      calls.push({ model: "reportCard.findUniqueOrThrow", where });
      const c = cards.find((x) => x.id === where.id);
      if (!c) throw new Error("not found");
      return { ...c, exam: { status: c.examStatus } };
    },
  },
  reportVersion: {
    findMany: async ({ where, select }: { where: Where; select?: Record<string, unknown> }) => { calls.push({ model: "reportVersion.findMany", where, select }); return versions.filter((v) => versionMatches(v, where)).map((v) => pick(v, select)); },
    findFirst: async ({ where }: { where: Where }) => {
      calls.push({ model: "reportVersion.findFirst", where });
      return versions.find((v) => v.id === where.id && v.reportCardId === where.reportCardId && v.approvedAt && v.publishedAt) ?? null;
    },
  },
} } });

const load = () => import("../../src/lib/academic/report-versions");
const qa01 = Array.from({ length: 30 }, (_, n) => `card-qa-01-${n}`);

test("30 released cards load in two school-scoped queries without the cached PDF", async () => {
  const { publishedVersionsFor } = await load();
  calls.length = 0;
  const rows = await publishedVersionsFor(qa01, "qa-01");
  assert.equal(rows.length, 30);
  assert.deepEqual(calls.map((c) => c.model), ["reportCard.findMany", "reportVersion.findMany"]);
  for (const c of calls) assert.equal(c.where.schoolId, "qa-01");
  assert.equal(calls[1].select?.documentBytes, undefined);
  for (const row of rows) assert.ok(!("documentBytes" in row));
  assert.deepEqual(rows.map((r) => r.reportCardId), qa01, "keeps the caller's newest-first order");
});

test("batched family rows match the per-card getPublishedVersion path exactly", async () => {
  const { publishedVersionsFor, getPublishedVersion, familyVersion } = await load();
  const batched = (await publishedVersionsFor(qa01, "qa-01")).map(familyVersion);
  const single = await Promise.all(qa01.map(async (id) => familyVersion(await getPublishedVersion(id))));
  assert.deepEqual(batched, single);
  assert.ok(batched.some((r) => r.status === "CORRECTED"));
});

test("another school's cards and versions never load under QA-01's scope", async () => {
  const { publishedVersionsFor, ReportConflict } = await load();
  await assert.rejects(publishedVersionsFor([qa01[0], "card-qa-02-0"], "qa-01"), ReportConflict);
  const qa02 = await publishedVersionsFor(["card-qa-02-0", "card-qa-02-1"], "qa-02");
  assert.deepEqual(qa02.map((v) => v.id), ["v-card-qa-02-0-2", "v-card-qa-02-1-2"]);
});

test("an unreleased card fails the load just as the per-card read did", async () => {
  const { publishedVersionsFor, ReportConflict } = await load();
  await assert.rejects(publishedVersionsFor([qa01[0], "card-draft-exam"], "qa-01"), ReportConflict);
  await assert.rejects(publishedVersionsFor([qa01[0], "card-unapproved"], "qa-01"), ReportConflict);
});

test("no cards means no queries", async () => {
  const { publishedVersionsFor } = await load();
  calls.length = 0;
  assert.deepEqual(await publishedVersionsFor([], "qa-01"), []);
  assert.equal(calls.length, 0);
});

test("parent and student portals use the batched loader behind the same gates", () => {
  const parent = readFileSync(new URL("../../src/app/api/parent/data/route.ts", import.meta.url), "utf8");
  assert.match(parent, /permissions\.learningRecords\s*\n?\s*\? \(await publishedVersionsFor\(student\.reportCards\.map\(r => r\.id\), schoolId\)\)/);
  assert.doesNotMatch(parent, /getPublishedVersion/);
  const student = readFileSync(new URL("../../src/app/actions/dashboard.ts", import.meta.url), "utf8");
  assert.match(student, /publishedVersionsFor\(student\.reportCards\.map\(r => r\.id\), session\.schoolId\)/);
  assert.doesNotMatch(student, /getPublishedVersion/);
});
