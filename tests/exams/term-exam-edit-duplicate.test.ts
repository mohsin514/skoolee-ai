import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("SKAI-241 editing an exam's type or term cannot create a second term exam for the class", () => {
  const src = readFileSync("src/app/api/exams/route.ts", "utf8");
  const body = src.slice(src.indexOf("async function editExamDetails"), src.indexOf("export async function GET"));
  assert.match(body, /\["MID_TERM", "FINAL"\]\.includes\(nextType\)/);
  assert.match(body, /id: \{ not: current\.id \}/);
  assert.match(body, /This class already has this term exam/);
  assert.ok(body.indexOf("const clash") < body.indexOf("tx.exam.updateMany"), "the clash check runs before the write");
});
