import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-818: an interactive $transaction resolves the tenant once, before the transaction opens, and runs its
// callback inside that tenant context. If the context were resolved per query inside the transaction, a query
// whose two-second resolution cache had expired would read the session on the base client. With a one-connection
// pool that read waits for the connection the transaction already holds, the transaction times out and the
// request returns 500 (bank statement commit, QA on dev).
const source = readFileSync(new URL("../../src/lib/db/prisma.ts", import.meta.url), "utf8");

test("an interactive transaction resolves the tenant before it opens", () => {
  const resolveAt = source.indexOf("const outer = getTenantContext() ?? (await resolveTenantFromRequest());");
  const openAt = source.indexOf("return transact(async (tx: ReferenceClient) => {");
  assert.ok(resolveAt > 0, "outer tenant resolution is present");
  assert.ok(openAt > resolveAt, "resolution happens before the transaction opens");
});

test("the transaction callback runs inside the resolved tenant context", () => {
  assert.match(source, /return outer \? runWithTenantContext\(outer, run\) : run\(\);/);
});
