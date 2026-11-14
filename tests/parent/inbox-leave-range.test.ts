import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxLeaveRange } from "../../src/components/parent/inbox-leave-range";

// SKAI-1937: the family inbox showed a leave request as raw ISO text ("2026-11-23–2026-11-24").
const en = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const ar = (value: string) => new Intl.DateTimeFormat("ar", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

test("a leave range is formatted in the reader's language, not shown as ISO text", () => {
  assert.equal(inboxLeaveRange(en, "2026-11-23–2026-11-24"), "November 23, 2026 – November 24, 2026");
  const arabic = inboxLeaveRange(ar, "2026-11-23–2026-11-24")!;
  assert.doesNotMatch(arabic, /2026-11-2/);
  assert.equal(arabic, `${ar("2026-11-23")} – ${ar("2026-11-24")}`);
});

test("a one-day leave reads as that day alone", () => {
  assert.equal(inboxLeaveRange(en, "2026-11-23–2026-11-23"), "November 23, 2026");
});

test("anything that is not a date range passes through unchanged", () => {
  assert.equal(inboxLeaveRange(en, null), null);
  assert.equal(inboxLeaveRange(en, "v2 · changed"), "v2 · changed");
  assert.equal(inboxLeaveRange(en, "2026-11-23"), "2026-11-23");
});
