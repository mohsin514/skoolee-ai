import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OPPORTUNITY_PAGE, opportunityOffset } from "@/lib/pathways/service";
import { arabicWorkflowUi, urduWorkflowUi } from "@/lib/locale/workflow-ui-messages";

const service = readFileSync("src/lib/pathways/service.ts", "utf8");

test("SKAI-1719: opportunities page past 100 in a stable, tie-broken order", () => {
  const page = service.slice(service.indexOf("async function opportunityPage"), service.indexOf("export const opportunityOffset"));
  assert.match(page, /orderBy: \[\{ deadline: "asc" \}, \{ createdAt: "desc" \}, \{ id: "asc" \}\], skip: offset, take: OPPORTUNITY_PAGE \+ 1/);
  assert.match(page, /opportunitiesNext: rows\.length > OPPORTUNITY_PAGE \? offset \+ OPPORTUNITY_PAGE : null/);
  assert.equal(OPPORTUNITY_PAGE, 100);
  assert.doesNotMatch(service.slice(service.indexOf("export async function pathwayOverview")), /take: 100\b/);
});

test("SKAI-1719: later pages keep the overview's school, campus and role scope; bad offsets are refused", () => {
  assert.match(service, /where: \{ schoolId: user\.schoolId, campusId, \.\.\.\(includeWithdrawn \? \{\} : \{ status: "ACTIVE" \}\) \}/);
  const next = service.slice(service.indexOf("export async function pathwayOpportunities"), service.indexOf("export async function pathwayOverview"));
  assert.match(next, /user\.role === "STUDENT"\) return opportunityPage\(user, \(await ownStudent\(user\)\)\.campusId, false, offset\)/);
  assert.match(next, /assert\(STAFF\.includes\(user\.role\)/, "guardians and other roles are refused");
  assert.match(next, /opportunityPage\(user, campusOf\(user\), true, offset\)/);
  assert.equal(opportunityOffset("100"), 100);
  assert.equal(opportunityOffset(null), 0);
  for (const bad of ["-1", "1.5", "abc", "999999"]) assert.throws(() => opportunityOffset(bad), /changed/);
});

test("SKAI-1719: both opportunity lists offer a localized Load more", () => {
  const view = readFileSync("src/components/pathways/pathway-panel.tsx", "utf8");
  assert.equal(view.match(/\{moreOpportunities\(view\.opportunitiesNext\)\}/g)?.length, 2);
  for (const key of ["Load more opportunities", "Loading more opportunities…", "More opportunities could not be loaded. The list shown is kept."]) assert.ok(arabicWorkflowUi[key] && urduWorkflowUi[key], key);
});
