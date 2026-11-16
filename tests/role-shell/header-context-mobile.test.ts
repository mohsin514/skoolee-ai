import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// SKAI-2157: the header context slot (parent child switcher) must not sit inside a `hidden sm:flex` wrapper.
const src = readFileSync(new URL("../../src/components/role-dashboard/RoleHeader.tsx", import.meta.url), "utf8");

test("header context slot is not hidden below sm", () => {
  const i = src.indexOf('data-tour="shell.header.context"');
  assert.ok(i > 0);
  const wrapperStart = src.lastIndexOf('<div className="me-auto', i);
  const wrapper = src.slice(wrapperStart, src.indexOf(">", wrapperStart));
  assert.ok(!/\bhidden\b/.test(wrapper), `context wrapper hides on phones: ${wrapper}`);
});
