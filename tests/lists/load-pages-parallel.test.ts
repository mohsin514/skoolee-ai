import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestFailure } from "../../src/lib/http/request-state";
import { LIST_PAGE_CONCURRENCY, loadListPages } from "../../src/lib/lists/load-pages";

type Row = { id: string };

/** A synthetic paged API: `total` rows of 100 per page, each answer delayed a tick. */
function pagedApi(total: number, tweak?: (page: number, body: { data: Row[]; pagination: { page: number; total: number; pages: number } }) => void) {
  const urls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const request = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://synthetic.test");
    urls.push(url.pathname + url.search);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    const page = Number(url.searchParams.get("page"));
    const limit = Number(url.searchParams.get("limit"));
    const pages = Math.ceil(total / limit);
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - (page - 1) * limit)) }, (_, i) => ({ id: `row-${(page - 1) * limit + i}` }));
    const body = { success: true, data, pagination: { page, total, pages } };
    tweak?.(page, body);
    return Response.json(body);
  }) as typeof fetch;
  return { request, urls, maxInFlight: () => maxInFlight };
}

test("every page arrives in order, with later pages read a few at a time", async () => {
  const api = pagedApi(1150);
  const rows = await loadListPages<Row>("/api/students", new URLSearchParams({ status: "archived" }), api.request);
  assert.equal(rows.length, 1150);
  assert.deepEqual(rows.map((row) => row.id), Array.from({ length: 1150 }, (_, i) => `row-${i}`));
  assert.equal(api.urls.length, 12);
  assert.ok(api.urls.every((url) => url.startsWith("/api/students?status=archived&limit=100&page=")));
  assert.equal(api.urls[0], "/api/students?status=archived&limit=100&page=1");
  assert.equal(api.maxInFlight(), LIST_PAGE_CONCURRENCY);
});

test("round trips grow with pages / concurrency, not with every page", async () => {
  const api = pagedApi(5000);
  const rows = await loadListPages<Row>("/synthetic", new URLSearchParams(), api.request);
  assert.equal(rows.length, 5000);
  assert.equal(api.urls.length, 50);
  // 50 pages used to mean 50 back-to-back round trips; now page 1 plus ceil(49 / 4) = 13 waves.
  assert.equal(api.maxInFlight(), LIST_PAGE_CONCURRENCY);
});

test("single and empty lists need one request", async () => {
  for (const total of [0, 37, 100]) {
    const api = pagedApi(total);
    assert.equal((await loadListPages<Row>("/synthetic", new URLSearchParams(), api.request)).length, total);
    assert.equal(api.urls.length, 1);
  }
});

test("a write during the load fails visibly instead of returning shifted rows", async () => {
  const duplicate = pagedApi(450, (page, body) => { if (page === 3) body.data[0] = { id: "row-150" }; });
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), duplicate.request), /list changed/);
  const grown = pagedApi(450, (page, body) => { if (page === 4) body.pagination.total = 451; });
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), grown.request), /list changed/);
  const shrunk = pagedApi(450, (page, body) => { if (page === 5) { body.data = []; } });
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), shrunk.request), /list changed/);
  const repaged = pagedApi(450, (page, body) => { if (page === 2) body.pagination.pages = 6; });
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), repaged.request), /list changed/);
  const malformed = pagedApi(450, (_page, body) => { (body.pagination as { pages: unknown }).pages = "5"; });
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), malformed.request), /list changed/);
});

test("a denied later page rejects the whole load and stops queueing pages", async () => {
  const urls: string[] = [];
  const request = (async (input: RequestInfo | URL) => {
    const page = Number(new URL(String(input), "http://synthetic.test").searchParams.get("page"));
    urls.push(String(input));
    if (page === 1) return Response.json({ success: true, data: [{ id: "a" }], pagination: { pages: 40, total: 4000 } });
    return new Response("private diagnostic", { status: 403 });
  }) as typeof fetch;
  await assert.rejects(loadListPages("/synthetic", new URLSearchParams(), request), (error: unknown) => error instanceof RequestFailure && error.kind === "denied");
  assert.ok(urls.length <= 1 + LIST_PAGE_CONCURRENCY, `requested ${urls.length} pages`);
});
