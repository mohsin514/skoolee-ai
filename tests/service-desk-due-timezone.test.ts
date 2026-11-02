import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1677: the due editor shows local wall time and an unchanged value keeps the stored deadline instant.
const source = readFileSync("src/components/service-desk/service-desk.tsx", "utf8");

test("the editor is filled with local wall time, not UTC", () => {
  assert.doesNotMatch(source, /new Date\(d\.resolveDueAt\)\.toISOString\(\)\.slice\(0, 16\)/);
  assert.match(source, /setDue\(d\.resolveDueAt \? toLocalInput\(d\.resolveDueAt\) : ""\)/);
  const fn = source.match(/function toLocalInput\(iso: string\) \{ (.+) \}/)?.[1];
  assert.ok(fn);
  // Round trip: local wall time parsed back by the browser gives the same minute.
  const toLocalInput = new Function("iso", fn) as (iso: string) => string;
  const iso = "2026-11-02T11:52:00.000Z";
  assert.equal(new Date(toLocalInput(iso)).toISOString(), iso);
});

test("an unchanged editor value sends the original deadline instant", () => {
  assert.match(source, /resolveDueAt: open\.resolveDueAt && due === toLocalInput\(open\.resolveDueAt\) \? open\.resolveDueAt : new Date\(due\)\.toISOString\(\)/);
});
