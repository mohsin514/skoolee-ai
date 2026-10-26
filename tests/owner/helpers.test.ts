import assert from "node:assert/strict";
import test from "node:test";
import { ownerPagination, boundedInteger } from "@/lib/owner/list-query";
import { loadOwnerPages } from "@/lib/owner/load-pages";
import { defaultPricingSchema, schoolPricingSchema } from "@/lib/owner/pricing";

test("pagination contains malformed, negative, fractional and overflowing input", () => {
  for (const value of ["nope", "-1", "2.5", "Infinity", "1e8", "9007199254740992"]) {
    assert.deepEqual(ownerPagination(new URLSearchParams({ page: value, limit: value })), { page: 1, limit: 25 });
  }
  assert.deepEqual(ownerPagination(new URLSearchParams("page=0&limit=999")), { page: 1, limit: 100 });
  const { page, limit } = ownerPagination(new URLSearchParams("page=9007199254740991&limit=200"), 50, 200);
  assert.ok((page - 1) * limit < 2_147_483_647);
  assert.equal(boundedInteger("bad", 30, 365), 30);
});

test("exports and school selectors load beyond 50 pages and preserve filters", async () => {
  let requests = 0;
  const params = new URLSearchParams("schoolId=school-b&role=TEACHER");
  const rows = await loadOwnerPages<number>("/api/owner/users", params, async (url) => {
    const query = new URL(String(url), "http://local").searchParams;
    assert.equal(query.get("schoolId"), "school-b");
    assert.equal(query.get("role"), "TEACHER");
    assert.equal(query.get("limit"), "100");
    requests++;
    return Response.json({ success: true, data: [Number(query.get("page"))], pagination: { pages: 51 } });
  });
  assert.equal(requests, 51);
  assert.equal(rows.at(-1), 51);
  assert.equal(params.has("page"), false);
});

test("a failed later page cannot produce a successful partial export", async () => {
  let requests = 0;
  await assert.rejects(loadOwnerPages("/api/owner/users", undefined, async () => ++requests === 1
    ? Response.json({ success: true, data: [1], pagination: { pages: 2 } })
    : Response.json({ error: "Unavailable" }, { status: 503 })), /Unavailable/);
  await assert.rejects(loadOwnerPages("/api/owner/users", undefined, async () => Response.json({ success: true, data: [], pagination: { pages: 2 } })), /list changed/);
});

test("pricing rejects malformed entries, unknown plans, negative and non-finite values", () => {
  for (const schema of [defaultPricingSchema, schoolPricingSchema]) {
    for (const input of [[], null, { BASIC: 4 }, { BASIC: null }, { BAD: { price: 1 } }, { BASIC: { price: -1 } }, { BASIC: { price: Infinity } }, { BASIC: { price: "100" } }]) {
      assert.equal(schema.safeParse(input).success, false, JSON.stringify(input));
    }
    assert.equal(schema.safeParse({ BASIC: { price: 0 }, PRO: { price: 12.5 }, ENTERPRISE: {} }).success, true);
  }
  assert.equal(defaultPricingSchema.safeParse({ ENTERPRISE: { price: null } }).success, true);
  assert.equal(schoolPricingSchema.safeParse({ ENTERPRISE: { price: null } }).success, false);
});
