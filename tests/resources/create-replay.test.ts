import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/lib/resources/service.ts", "utf8");
const create = source.slice(source.indexOf("export async function createResource"), source.indexOf("\nexport ", source.indexOf("export async function createResource") + 10));

test("SKAI-624: create serialises per class and author before checking for a replay", () => {
  assert.match(create, /pg_advisory_xact_lock\(hashtext\(\$\{`learning-resource:\$\{klass\.id\}:\$\{user\.userId\}`\}\)\)/);
  assert.ok(create.indexOf("pg_advisory_xact_lock") < create.indexOf("learningResource.create("));
});

test("SKAI-624: only the author's recent, identical, untouched draft is replayed", () => {
  const lookup = create.slice(create.indexOf("const recent"), create.indexOf("if (recent)"));
  for (const field of ["schoolId: user.schoolId", "classId: klass.id", "ownerId: user.userId", 'status: "DRAFT"', "latestVersion: 1", "kind: input.kind", "audience: input.audience", 'mode: "insensitive"', "CREATE_REPLAY_WINDOW_MS"]) assert.ok(lookup.includes(field), field);
  assert.match(create, /sameContent/);
  assert.ok(create.indexOf("return { resource: recent") < create.indexOf("learningResource.create("));
  assert.ok(create.indexOf("auditLog.create") > create.indexOf("learningResource.create("), "a replay writes no second audit row");
});

test("SKAI-1769: language, source rights and subject are part of the replay identity", () => {
  const lookup = create.slice(create.indexOf("const recent"), create.indexOf("if (recent)"));
  for (const field of ["language: input.language", "sourceRights: input.sourceRights", "subjectId: input.subjectId ?? null"]) assert.ok(lookup.includes(field), field);
});

test("SKAI-1769: a differing description, objectives or file type is never replayed", () => {
  const same = create.slice(create.indexOf("const sameContent"), create.indexOf("if (sameContent)"));
  for (const field of ["first.description === input.description", "sameObjectives(recent.objectives, input.objectives)", "first.contentType === input.content.contentType"]) assert.ok(same.includes(field), field);
});

test("SKAI-1769: objectives compare regardless of stored key order", async () => {
  const { sameObjectives } = await import("../../src/lib/resources/service");
  const requested = { curriculumId: "c1", curriculumVersion: 2, outcomeIds: ["o1", "o2"] };
  assert.equal(sameObjectives({ outcomeIds: ["o1", "o2"], curriculumId: "c1", curriculumVersion: 2 }, requested), true);
  assert.equal(sameObjectives({ ...requested, outcomeIds: ["o1"] }, requested), false);
  assert.equal(sameObjectives(null, undefined), true);
  assert.equal(sameObjectives(null, requested), false);
});
