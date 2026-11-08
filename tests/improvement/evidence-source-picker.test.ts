import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SOURCE_PAGE, sourceOffset } from "@/lib/improvement/service";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

const service = readFileSync("src/lib/improvement/service.ts", "utf8");
const view = readFileSync("src/components/improvement/improvement-workspace.tsx", "utf8");

test("SKAI-1722: intervention plans and report cards page past 50 in the same school/campus scope", () => {
  const body = service.slice(service.indexOf("export async function sources"));
  assert.doesNotMatch(body.slice(0, 1800), /take: 50\b/);
  assert.equal(SOURCE_PAGE, 50);
  assert.match(body, /interventionPlan\.findMany\(\{ where: \{ schoolId: user\.schoolId, \.\.\.campus \}, .*orderBy: \[\{ updatedAt: "desc" \}, \{ id: "desc" \}\], skip: offset, take: SOURCE_PAGE \+ 1/);
  assert.match(body, /reportCard\.findMany\(\{ where: \{ schoolId: user\.schoolId, \.\.\.campus \}, .*orderBy: \{ id: "desc" \}, skip: offset, take: SOURCE_PAGE \+ 1/);
  assert.match(body, /assert\(!NOT_STAFF\.includes\(user\.role\)/);
  assert.match(body, /rows\.length > SOURCE_PAGE \? offset \+ SOURCE_PAGE : null/);
  assert.equal(sourceOffset("50"), 50);
  for (const bad of ["-1", "x", "2.5"]) assert.throws(() => sourceOffset(bad), /changed/);
});

test("SKAI-1722: a failed source load shows Try again instead of an empty picker", () => {
  assert.doesNotMatch(view, /catch\(\(\) => setSources\(\[\]\)\)/);
  assert.match(view, /catch\(\(\) => setSourceError\(true\)\)/);
  assert.match(view, /<ErrorState description=\{ui\("Source records could not be loaded\."\)\} onRetry=\{loadSources\}/);
  assert.match(view, /data-evidence-more/);
  for (const key of ["Source records could not be loaded.", "Load more records", "Loading more records…", "More records could not be loaded. The list shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
