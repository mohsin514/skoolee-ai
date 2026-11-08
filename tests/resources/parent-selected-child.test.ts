import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { listInput } from "@/lib/resources/service";

const service = readFileSync("src/lib/resources/service.ts", "utf8");

test("SKAI-1524: the list API accepts the selected child", () => {
  assert.equal(listInput.parse({ studentId: "child-b" }).studentId, "child-b");
});

test("SKAI-1524: a guardian's list is narrowed to the selected child inside their own scope", () => {
  assert.match(service, /studentScope\(user, "learningRecords"\), \{ archivedAt: null \}, \.\.\.\(studentId \? \[\{ id: studentId \}\] : \[\]\)/);
  assert.match(service, /learnerReach\(tx, user, user\.role === "PARENT" \? input\.studentId : undefined\)/);
  const reachCalls = service.match(/learnerReach\(tx, user[^)]*\)/g) ?? [];
  assert.equal(reachCalls.filter(call => call === "learnerReach(tx, user)").length, 1, "file access keeps the full family scope");
});

test("SKAI-1524: the parent page passes the selected child and reloads when it changes", () => {
  const page = readFileSync("src/components/resources/ResourcePages.tsx", "utf8");
  assert.match(page, /<ResourceLibrary key=\{selectedStudentId \?\? "all"\} audience="guardian" studentId=\{selectedStudentId \?\? undefined\} \/>/);
  const library = readFileSync("src/components/resources/ResourceLibrary.tsx", "utf8");
  assert.match(library, /\{ classId, viewAs, q, studentId \}/);
  assert.match(library, /\}, \[classId, viewAs, q, studentId\]\);/);
});
