import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { capability } from "../../src/lib/ai-workflows/registry";
import { schoolCreationName, readFormAnswer, validateFormPatch } from "../../src/lib/ai-workflows/planner/form-dialogue";
after(async () => { await prisma.$disconnect(); redis.disconnect(); });
const entry = capability("platform.provision_school")!;
const fields = entry.dialogueFields!;

test("explicit school creation routes with names before or after school; unrelated/negative asks do not", () => {
  assert.equal(schoolCreationName("create test 3 school"), "test 3");
  assert.equal(schoolCreationName("create new school TTTTT"), "TTTTT");
  assert.equal(schoolCreationName("Please create a new school"), "");
  assert.equal(schoolCreationName("Don't create a school"), null);
  assert.equal(schoolCreationName("Show me a school"), null);
});

test("short answers bind only to the pending question; email never becomes a name", () => {
  assert.deepEqual(readFormAnswer("Lahore", fields, "/city"), { city: "Lahore" });
  assert.deepEqual(readFormAnswer("owner+qa@example.invalid", fields, "/schoolName"), { ownerEmail: "owner+qa@example.invalid" });
  assert.deepEqual(readFormAnswer("Single school (STANDALONE)", fields, "/kind"), { kind: "STANDALONE" });
  assert.deepEqual(readFormAnswer("What is the owner email?", fields, "/ownerEmail"), {});
});

test("labelled multi-field answers and corrections validate against the real schema", () => {
  const patch = readFormAnswer("School name TTTTT. City Lahore. Owner name Sara QA. Owner email sara+test@example.invalid.", fields);
  assert.deepEqual(patch, { schoolName: "TTTTT", city: "Lahore", ownerName: "Sara QA", ownerEmail: "sara+test@example.invalid" });
  const form = validateFormPatch(entry, {}, patch);
  assert.deepEqual(form.missing, ["/kind"]);
  const invalid = validateFormPatch(entry, form.input, { ownerEmail: "wrong-address" });
  assert.deepEqual(invalid.missing, ["/ownerEmail", "/kind"]);
  assert.equal(invalid.input.ownerName, "Sara QA");
});
