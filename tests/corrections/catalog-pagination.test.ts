import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CATALOG_PAGE_SIZE, catalogNextCursor, catalogPageWhere } from "@/lib/corrections/service";

test("SKAI-1703: 101 eligible payments return a cursor that reaches the 101st, ties included", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `p${String(500 - i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 0, 1) - Math.floor(i / 2) * 60_000) }));
  const cursor = catalogNextCursor(rows);
  assert.ok(cursor);
  const where = catalogPageWhere("PAYMENT", cursor) as { OR: [{ createdAt: { lt: Date } }, { createdAt: Date; id: { lt: string } }] };
  const rest = rows.filter(r => r.createdAt < where.OR[0].createdAt.lt || (r.createdAt.getTime() === where.OR[1].createdAt.getTime() && r.id < where.OR[1].id.lt));
  assert.deepEqual(rest.map(r => r.id), [rows[100].id]);
  assert.equal(catalogNextCursor(rows.slice(0, CATALOG_PAGE_SIZE)), null);
});

test("SKAI-1703: 101 eligible marks page by id; forged cursors are refused", () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: `m${String(900 - i).padStart(3, "0")}` }));
  assert.deepEqual(catalogPageWhere("MARK", catalogNextCursor(rows)), { id: { lt: rows[99].id } });
  assert.deepEqual(catalogPageWhere("MARK", null), {});
  assert.throws(() => catalogPageWhere("PAYMENT", Buffer.from("nope|x").toString("base64url")), /changed/);
  assert.throws(() => catalogPageWhere("MARK", "Zm9v"), /changed/);
});

test("SKAI-1703: every page keeps the campus, teacher and eligibility filters; no fixed 100 cap", () => {
  const service = readFileSync("src/lib/corrections/service.ts", "utf8");
  const body = service.slice(service.indexOf("export async function catalog("));
  assert.doesNotMatch(body.slice(0, 1500), /take: 100\b/);
  assert.match(body, /prisma\.mark\.findMany\(\{ where: \{ \.\.\.campusScope\(user\), \.\.\.page, \.\.\.\(user\.role === "TEACHER"/);
  assert.match(body, /prisma\.payment\.findMany\(\{ where: \{ \.\.\.campusScope\(user\), amount: \{ gt: 0 \}, reversalOfId: null, \.\.\.page \}/);
  assert.match(body.slice(0, 400), /if \(isFamily\(user\) \|\| !\(await canRequestKind\(user, kind\)\)\)/);
  const view = readFileSync("src/app/corrections/view.tsx", "utf8");
  assert.match(view, /data-load-more-records/);
  for (const key of ["loadMore", "loadingMore", "moreFailed", "retryMore"]) assert.equal(view.match(new RegExp(`${key}: "`, "g"))?.length, 3, key);
});
