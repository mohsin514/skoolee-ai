// SKAI-953: pure parts of the page-weight budget check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayRoute, routeChunks, evaluate, formatKb, formatTable } from "../../scripts/size-check.mjs";

test("displayRoute strips route groups", () => {
  assert.equal(displayRoute("/(auth)/login"), "/login");
  assert.equal(displayRoute("/(public)/pricing"), "/pricing");
  assert.equal(displayRoute("/(public)"), "/");
});

test("routeChunks unions root and entry chunks, JS only, no duplicates", () => {
  const chunks = routeChunks(["a.js", "b.js"], { layout: ["b.js", "c.js", "s.css"], page: ["c.js", "d.js"] });
  assert.deepEqual(chunks, ["a.js", "b.js", "c.js", "d.js"]);
});

test("evaluate passes at the budget and fails one byte over", () => {
  const ok = evaluate([{ route: "/(auth)/login", chunks: 1, gzipBytes: 300 * 1024 }], 300);
  assert.equal(ok.failed, false);
  const over = evaluate([{ route: "/(auth)/login", chunks: 1, gzipBytes: 300 * 1024 + 1 }], 300);
  assert.equal(over.failed, true);
  assert.equal(over.rows[0].over, true);
});

test("formatTable shows route, size and status", () => {
  assert.equal(formatKb(1536), "1.5 KB");
  const table = formatTable(evaluate([
    { route: "/(auth)/login", chunks: 3, gzipBytes: 400 * 1024 },
    { route: "/(public)/terms", chunks: 2, gzipBytes: 100 * 1024 },
  ], 300));
  assert.match(table, /\/login\s+3\s+400\.0 KB\s+300\.0 KB\s+OVER by 100\.0 KB/);
  assert.match(table, /\/terms\s+2\s+100\.0 KB\s+300\.0 KB\s+ok/);
});

test("the CI page-weight step blocks: no continue-on-error", async () => {
  const { readFileSync } = await import("node:fs");
  const yml = readFileSync(new URL("../../.github/workflows/pr-checks.yml", import.meta.url), "utf8");
  const start = yml.indexOf("- name: Page-weight budget");
  assert.ok(start >= 0, "Page-weight budget step is missing");
  const step = yml.slice(start, yml.indexOf("- name:", start + 10));
  assert.doesNotMatch(step, /^\s*continue-on-error:/m);
  assert.match(step, /size:check/);
});
