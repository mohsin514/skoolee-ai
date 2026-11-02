import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1564: accepting an offer reports the stored status, and the toast matches it.
const service = readFileSync("src/lib/activities/service.ts", "utf8");
const ui = readFileSync("src/components/activities/activities.tsx", "utf8");

test("answerOffer returns the place status after requirement sync", () => {
  const body = service.slice(service.indexOf("export async function answerOffer"), service.indexOf("export async function cancelPlace"));
  assert.ok(body.indexOf("syncRequirements(tx, activity)") < body.indexOf("const after = await tx.activityPlace.findUniqueOrThrow"));
  assert.match(body, /return \{ status: after\.status, offered: \[\] as string\[\] \};/);
  assert.doesNotMatch(body, /return \{ status: "RESERVED"/);
});

test("the family toast says confirmed only when the place is confirmed", () => {
  assert.match(ui, /r => r\.status === "CONFIRMED" \? "Place confirmed\." : "Place reserved\. One or more requirements remain\."/);
});
