import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameWindowDetails } from "../../src/lib/meetings/service";

// SKAI-1786: a same-slot create replays only when its family-facing details are unchanged.
const base = { slotMinutes: 15, bufferMinutes: 5, maxBookings: 4 as number | null, mode: "IN_PERSON", location: "Room 4" as string | null, cancellationPolicy: "24 hours" };

test("an unchanged retry is the same window", () => {
  assert.equal(sameWindowDetails(base, { ...base }), true);
  assert.equal(sameWindowDetails({ ...base, maxBookings: null }, { ...base, maxBookings: null }), true);
});

test("changed location, policy, mode, duration, buffer or booking limit is not a replay", () => {
  for (const change of [{ location: "Room 9" }, { cancellationPolicy: "48 hours" }, { mode: "EITHER" }, { slotMinutes: 20 }, { bufferMinutes: 0 }, { maxBookings: null }, { maxBookings: 6 }]) {
    assert.equal(sameWindowDetails(base, { ...base, ...change }), false, JSON.stringify(change));
  }
});

test("createWindow throws a 409 on a changed same-slot create, inside the teacher lock", () => {
  const src = readFileSync("src/lib/meetings/service.ts", "utf8");
  const create = src.slice(src.indexOf("export async function createWindow"), src.indexOf("export async function withdrawWindow"));
  const lock = create.indexOf("FOR UPDATE"), check = create.indexOf("sameWindowDetails(existing"), conflict = create.indexOf(", 409);"), insert = create.indexOf("tx.meetingWindow.create(");
  assert.ok(lock > 0 && check > lock && conflict > check && insert > conflict);
});
