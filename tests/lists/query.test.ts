import assert from "node:assert/strict";
import { test } from "node:test";
import { listPagination, pageWindow, patchListQuery } from "../../src/lib/lists/query";

test("hostile paging values never produce unbounded, fractional or negative database offsets", () => {
  for (const value of ["-1", "NaN", "Infinity", "1.5", "12oops", "9007199254740992", "", "0", "999999999"]) {
    const result = listPagination(new URLSearchParams({ page: value, pageSize: value }), 20, 50, "pageSize");
    assert.ok(result.limit >= 1 && result.limit <= 50);
    assert.ok(Number.isSafeInteger(result.page) && result.page >= 1);
    assert.ok((result.page - 1) * result.limit < 2_147_483_647);
  }
});

test("changing filters resets the page and preserves scope, draft and other lists", () => {
  const next = patchListQuery("campus=north&draft=unsaved&inv.page=9&inv.status=paid&pay.page=2", { "inv.status": "unpaid" }, "inv.page");
  assert.equal(next.get("inv.page"), null);
  assert.equal(next.get("campus"), "north");
  assert.equal(next.get("draft"), "unsaved");
  assert.equal(next.get("pay.page"), "2");
  assert.equal(patchListQuery(next.toString(), { "inv.page": "2" }, "inv.page").get("inv.page"), "2");
});

test("no-op filters retain page, clearing a filter invalidates it", () => {
  assert.equal(patchListQuery("q=Ali&page=3", { q: "Ali" }).get("page"), "3");
  assert.equal(patchListQuery("q=Ali&page=3", { q: null }).get("page"), null);
});

test("empty, deleted last page and invalid persisted page sizes remain bounded", () => {
  assert.deepEqual(pageWindow(0, 90, 25), { page: 1, size: 25, pages: 1, skip: 0, first: 0, last: 0 });
  assert.deepEqual(pageWindow(26, 90, 25), { page: 2, size: 25, pages: 2, skip: 25, first: 26, last: 26 });
  assert.equal(pageWindow(50, -2, 0).page, 1);
  assert.equal(pageWindow(50, 2, Infinity).size, 25);
});

test("large authorized collections page without duplicating or omitting records", () => {
  const rows = Array.from({ length: 50_003 }, (_, id) => id);
  const seen: number[] = [];
  for (let requested = 1; requested <= Math.ceil(rows.length / 96); requested++) {
    const window = pageWindow(rows.length, requested, 96);
    seen.push(...rows.slice(window.skip, window.skip + window.size));
  }
  assert.deepEqual(seen, rows);
});
