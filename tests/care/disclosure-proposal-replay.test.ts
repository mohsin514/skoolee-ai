import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

// SKAI-1704: a retried or second-tab disclosure proposal replays the pending one; no second disclosure,
// chronology entry, audit row or review alert.
type Disclosure = Record<string, unknown> & { id: string };
const disclosures: Disclosure[] = [], entries: unknown[] = [], logs: Array<{ action: string }> = [];
const locks = new Map<string, Promise<void>>();
const members: Record<string, { campusId: string; role: string }> = { "lead-a": { campusId: "campus-a1", role: "LEAD" }, "lead-a2": { campusId: "campus-a1", role: "DEPUTY" }, "lead-b": { campusId: "campus-b1", role: "LEAD" } };
const concerns = [{ id: "con-a", schoolId: "school-a", campusId: "campus-a1", studentId: "kid-a", implicatedGuardianIds: [] as string[] }, { id: "con-b", schoolId: "school-b", campusId: "campus-b1", studentId: "kid-b", implicatedGuardianIds: [] as string[] }];
const model = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => disclosures.find((d) => Object.entries(where).every(([k, v]) => d[k] === v)) ?? null,
  create: async ({ data }: { data: Record<string, unknown> }) => { await new Promise((r) => setTimeout(r, 5)); const row = { id: `d${disclosures.length + 1}`, status: "PROPOSED", ...data }; disclosures.push(row); return row; },
};
const client = {
  confidentialMember: { findFirst: async ({ where }: { where: { userId: string; schoolId: string } }) => { const m = members[where.userId]; return m && where.schoolId === `school-${m.campusId.slice(-2, -1)}` ? { ...m, domain: "SAFEGUARDING" } : null; } },
  confidentialSetting: { findFirst: async () => ({ enabled: true }) },
  confidentialAccessLog: { create: async ({ data }: { data: { action: string } }) => { logs.push(data); return data; } },
  safeguardingConcern: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => concerns.find((c) => c.id === where.id && c.schoolId === where.schoolId && c.campusId === where.campusId) ?? null },
  safeguardingDisclosure: model,
  safeguardingEntry: { create: async ({ data }: { data: unknown }) => { entries.push(data); return data; } },
};
const run = async <T>(_u: unknown, work: (tx: unknown) => Promise<T>) => {
  let release = () => {};
  const tx = { ...client, $executeRaw: async (_s: TemplateStringsArray, key: string) => {
    while (locks.has(key)) await locks.get(key);
    locks.set(key, new Promise<void>((r) => { release = () => { locks.delete(key); r(); }; }));
  } };
  try { return await work(tx); } finally { release(); }
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: client } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: run } });

const lead = (id: string) => ({ userId: id, schoolId: `school-${members[id].campusId.slice(-2, -1)}`, campusId: members[id].campusId, role: "TEACHER" }) as never;
const body = { concernId: "con-a", recipientType: "EXTERNAL_AGENCY", recipientName: "QA Synthetic Agency desk", purpose: "Synthetic referral", content: "Synthetic disclosure content only." };
const reset = () => { disclosures.length = 0; entries.length = 0; logs.length = 0; };
const load = async () => (await import("../../src/lib/care/service")).proposeDisclosure;

test("a lost-response retry replays the pending proposal", async () => {
  const propose = await load();
  reset();
  const a = await propose(lead("lead-a"), body), b = await propose(lead("lead-a"), body);
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);
  assert.equal(b.id, a.id);
  assert.equal(disclosures.length, 1);
  assert.equal(entries.length, 1);
  assert.equal(logs.filter((l) => l.action === "CREATE").length, 1);
});

test("two tabs at once serialise into one proposal", async () => {
  const propose = await load();
  reset();
  const [x, y] = await Promise.all([propose(lead("lead-a"), body), propose(lead("lead-a"), body)]);
  assert.equal(x.id, y.id);
  assert.deepEqual([x.replayed, y.replayed].sort(), [false, true]);
  assert.equal(disclosures.length, 1);
  assert.equal(entries.length, 1);
});

test("changed content is a new proposal; another school cannot reach the concern", async () => {
  const propose = await load();
  reset();
  await propose(lead("lead-a"), body);
  assert.equal((await propose(lead("lead-a"), { ...body, content: "Different synthetic content." })).replayed, false);
  assert.equal(disclosures.length, 2);
  await assert.rejects(propose(lead("lead-b"), body), (e: { status?: number }) => e.status === 404);
  assert.equal((await propose(lead("lead-b"), { ...body, concernId: "con-b" })).replayed, false);
  assert.equal(disclosures.filter((d) => d.schoolId === "school-b").length, 1);
});

test("a staff member without a safeguarding membership gets 403", async () => {
  const propose = await load();
  reset();
  const teacher = { userId: "t-x", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
  await assert.rejects(propose(teacher, body), (e: { status?: number }) => e.status === 403);
  assert.equal(disclosures.length, 0);
});

test("the route sends the review alert only for a new proposal", () => {
  const src = readFileSync("src/app/api/care/route.ts", "utf8");
  const block = src.slice(src.indexOf('case "propose-disclosure"'), src.indexOf('case "review-disclosure"'));
  assert.ok(block.indexOf("if (r.replayed) return ok(") < block.indexOf("notifyDisclosureReview("));
});
