import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../../src/lib/api/scope";
import { canCorrectRegister } from "../../src/lib/attendance/correction-permission";

// SKAI-229: a teacher without attendance.edit was offered "Review correction" on a submitted register, typed a
// reason and only then got "Insufficient permissions: attendance.edit denied for TEACHER". The register view now
// says whether the reader may correct, and the register locks a submitted day for readers who may not.
test("a permission refusal means the reader cannot correct; other failures still surface", async () => {
  assert.equal(await canCorrectRegister(async () => undefined), true);
  assert.equal(await canCorrectRegister(async () => { throw new ApiError("Insufficient permissions: attendance.edit denied for TEACHER", 403); }), false);
  await assert.rejects(canCorrectRegister(async () => { throw new Error("database down"); }), /database down/);
});

test("the register view reports canCorrect and the register locks a submitted day without it", () => {
  const view = readFileSync("src/lib/attendance/register.ts", "utf8");
  const body = view.slice(view.indexOf("export async function registerView"), view.indexOf("type EntryInput"));
  assert.match(body, /canCorrect/);
  const ui = readFileSync("src/components/attendance/class-register.tsx", "utf8");
  assert.match(ui, /const locked = submitted && data\?\.canCorrect === false/);
  assert.match(ui, /disabled=\{locked\}/);
  assert.match(ui, /Only a school leader can correct a submitted register\./);
});
