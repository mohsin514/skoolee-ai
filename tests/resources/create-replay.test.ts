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
