import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1940: the inbox lists rows by latest activity (lastRemindedAt ?? createdAt), id descending, so a reminded row
// never sorts ahead of newer rows that were never reminded, and cursor paging walks that same order exactly once.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Row = { id: string; userId: string; schoolId: string; createdAt: Date; lastRemindedAt: Date | null; category: string; isRead: boolean };
const at = (iso: string) => new Date(`2026-11-13T${iso}Z`);
const base = { schoolId: "s1", category: "UPDATE", isRead: false };
const rows: Row[] = [
  // The QA repro: d87 was created at 11:46 and last reminded at 16:42; f35 and 5de are newer and never reminded.
  { ...base, id: "d87", userId: "te1", createdAt: at("11:46:35"), lastRemindedAt: at("16:42:16") },
  { ...base, id: "80e", userId: "te1", createdAt: at("17:09:26"), lastRemindedAt: at("20:04:39") },
  { ...base, id: "f35", userId: "te1", createdAt: at("19:58:00"), lastRemindedAt: null },
  { ...base, id: "5de", userId: "te1", createdAt: at("19:58:00"), lastRemindedAt: null },
  { ...base, id: "old", userId: "te1", createdAt: at("08:00:00"), lastRemindedAt: null },
  { ...base, id: "tie", userId: "te1", createdAt: at("09:00:00"), lastRemindedAt: at("16:42:16") },
  { ...base, id: "aaa", userId: "te1", createdAt: at("16:42:16"), lastRemindedAt: null },
  { ...base, id: "x-other-user", userId: "te2", createdAt: at("23:00:00"), lastRemindedAt: null },
  { ...base, id: "x-other-school", userId: "te9", schoolId: "s2", createdAt: at("23:30:00"), lastRemindedAt: null },
];
const expected = ["80e", "f35", "5de", "tie", "d87", "aaa", "old"];

type Where = Record<string, unknown>;
const cmp = (value: unknown, cond: unknown): boolean => {
  if (cond === null) return value === null;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (cond && typeof cond === "object") {
    const c = cond as { lt?: Date | string; not?: unknown };
    if ("not" in c) return !cmp(value, c.not);
    if (c.lt !== undefined) return value !== null && value !== undefined && (value as Date | string) < c.lt;
  }
  return value === cond;
};
const matches = (row: Row, where: Where): boolean => Object.entries(where).every(([key, cond]) => {
  if (key === "AND") return (cond as Where[]).every((part) => matches(row, part));
  if (key === "OR") return (cond as Where[]).some((part) => matches(row, part));
  return cmp(row[key as keyof Row], cond);
});
type Order = Record<string, "desc" | { sort: "desc"; nulls: "last" }>;
const sortBy = (list: Row[], orderBy: Order[]) => [...list].sort((a, b) => {
  for (const order of orderBy) {
    const [key] = Object.keys(order) as Array<keyof Row>;
    const x = a[key] as Date | string, y = b[key] as Date | string;
    if (x < y) return 1;
    if (x > y) return -1;
  }
  return 0;
});

const queries: Where[] = [];
const prisma = {
  notification: {
    findFirst: async ({ where }: { where: Where }) => { queries.push(where); return rows.find((row) => matches(row, where)) ?? null; },
    findMany: async ({ where, orderBy, take }: { where: Where; orderBy: Order[]; take: number }) => { queries.push(where); return sortBy(rows.filter((row) => matches(row, where)), orderBy).slice(0, take); },
    updateMany: async () => ({ count: 0 }),
  },
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });

const user = { userId: "te1", schoolId: "s1", campusId: "c1", role: "TEACHER" } as AuthUser;

test("rows are ordered by latest activity, so a reminded row never jumps ahead of newer rows", async () => {
  const { listInbox } = await import(src("lib/notifications/actions.ts"));
  const { items, nextCursor } = await listInbox(user, { view: "all", limit: 50 });
  assert.deepEqual(items.map((item: { id: string }) => item.id), expected);
  assert.equal(nextCursor, null);
});

test("cursor paging walks the same order once, with no row skipped or repeated", async () => {
  const { listInbox } = await import(src("lib/notifications/actions.ts"));
  for (const limit of [1, 2, 3]) {
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listInbox(user, { view: "all", limit, cursor });
      seen.push(...page.items.map((item: { id: string }) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.deepEqual(seen, expected, `limit ${limit}`);
  }
});

test("every query stays scoped to the viewer, including the cursor lookup", async () => {
  const { listInbox } = await import(src("lib/notifications/actions.ts"));
  queries.length = 0;
  const other = await listInbox(user, { view: "all", limit: 5, cursor: "x-other-user" });
  assert.deepEqual(other, { items: [], nextCursor: null });
  await listInbox(user, { view: "all", limit: 2, cursor: "f35" });
  const scoped = (where: Where): boolean => where.userId === "te1" || (Array.isArray(where.AND) && (where.AND as Where[]).some(scoped));
  assert.ok(queries.length >= 4);
  for (const where of queries) assert.ok(scoped(where), JSON.stringify(where));
});

test("compareLatestActivity breaks equal activity by id descending", async () => {
  const { compareLatestActivity } = await import(src("lib/notifications/inbox-pages.ts"));
  const a = { id: "a", createdAt: at("10:00:00"), lastRemindedAt: null };
  const b = { id: "b", createdAt: at("09:00:00"), lastRemindedAt: at("10:00:00") };
  assert.deepEqual([a, b].sort(compareLatestActivity).map((row) => row.id), ["b", "a"]);
});
